# Deckbuilder — Design

**Date** : 2026-06-04
**Statut** : validé par l'utilisateur, prêt à passer au plan d'implémentation

## 1. Objectif

Ajouter à l'app Angular Yu-Gi-Oh existante une fonctionnalité de construction de deck :

- Naviguer/filtrer les cartes (réutiliser et étendre les filtres existants).
- Filtrer par set via un dropdown.
- Respecter et signaler la ban list TCG (Interdite / Limitée / Semi-Limitée).
- Construire un deck conforme aux règles officielles : Main 40-60, Extra 0-15, Side 0-15, max 3 copies cumulées, routage Main/Extra automatique selon le type de monstre.
- Gérer plusieurs decks nommés, persistés dans `localStorage`.

## 2. Décisions de cadrage

| Décision | Choix |
|---|---|
| Intégration UI | Page dédiée `/decks` + `/decks/:id` (séparée de l'index) |
| Ban list supportée | TCG uniquement |
| Persistance | Plusieurs decks nommés, `localStorage` |
| Filtre set | Dropdown `<select>` simple chargé depuis `cardsets.php` |
| UX ajout au deck | Clic = ouvre la fiche détail ; bouton `+` dans la fiche |
| Affichage deck | 3 grilles verticales (Main / Extra / Side) avec vignettes |
| Validation | Blocage dur des violations sans ambiguïté + warning persistant pour deck incomplet (< 40) |

## 3. Routes & navigation

| Route | Composant | Rôle |
|---|---|---|
| `/` | `YuGiIndex` (existant) | Consultation/recherche, légèrement adapté (nouveau header partagé) |
| `/decks` | `DeckListPage` (nouveau) | Liste des decks + création |
| `/decks/:id` | `DeckBuilderPage` (nouveau) | Édition du deck |

Garde-fou : si `/decks/:id` reçoit un id inexistant, redirection vers `/decks`.

Header partagé (`<app-header>`) : titre + liens nav (**Cartes** → `/`, **Mes decks** → `/decks`) + sélecteur de langue. Utilisé sur les trois pages.

## 4. Composants

### Refactor (réutilisation)

- **`CardGrid`** (extrait de `YuGiIndex`) : grille de cartes réutilisée par l'index et le deckbuilder.
  - Inputs : `cards: Daum[]`, `language: Language`, `loading: boolean`.
  - Output : `(cardClick)`.
  - Affiche les badges ban list en superposition top-right via `BanlistService`.
- **`AppHeader`** : header partagé (extrait de `app.html` actuel).
- **`YuGiFilters`** (étendu) : ajout d'un `<select>` set, alimenté par `SetService`. Les sets sont triés par `tcg_date` desc.
- **`YuGiCardDetail`** (étendu) :
  - Nouvel input `mode: 'view' | 'deckbuilder'`.
  - En mode `deckbuilder` : affiche un bouton **`+ Main Deck`** ou **`+ Extra Deck`** selon `defaultSectionFor(card)` et un bouton **`+ Side Deck`**.
  - Boutons désactivés avec tooltip si `canAddCard` retourne `allowed: false`.
  - Outputs : `(addToDeck)`, `(addToSide)`.

### Nouveaux composants

| Composant | Rôle |
|---|---|
| `DeckListPage` | `/decks` — liste, création (`prompt`), renommage, suppression (`confirm`). |
| `DeckBuilderPage` | `/decks/:id` — orchestre filtres, grille, panel deck et détail. |
| `DeckPanel` | Colonne droite : nom éditable inline, résumé validité, 3 `DeckSection`. |
| `DeckSection` | Une section (Main/Extra/Side) : titre, compteur coloré, grille de vignettes, retrait au clic. |

## 5. Modèle de données

```ts
// src/app/models/deck.ts
export type DeckSectionId = 'main' | 'extra' | 'side';

export interface DeckCardSnapshot {
  name: string;
  image_url_small: string;
  frameType: string;
  type: string;
  race: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
}

export interface DeckCard {
  cardId: number;             // Daum.id
  count: number;              // copies dans cette section
  snapshot: DeckCardSnapshot; // cache pour reload instantané
}

export interface Deck {
  id: string;                 // crypto.randomUUID()
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  createdAt: number;
  updatedAt: number;
}
```

Le `snapshot` permet de réafficher un deck instantanément au rechargement sans rappeler l'API. Champs cachés volontairement minimaux (juste ce qu'il faut pour la vignette + tri/affichage du Main/Extra/Side).

## 6. Services

Tous `providedIn: 'root'`, à base de signals.

### `BanlistService`

```ts
type BanStatus = 'Banned' | 'Limited' | 'Semi-Limited';

readonly status: Signal<Map<number, BanStatus>>;

constructor() { this.load(); }       // GET cardinfo.php?banlist=tcg au démarrage
get(cardId): BanStatus | undefined;
maxCopies(cardId): 0 | 1 | 2 | 3;    // 0 si Banned, 1 si Limited, 2 si Semi, 3 sinon
```

### `SetService`

```ts
interface CardSetInfo {
  set_name: string;
  set_code: string;
  num_of_cards: number;
  tcg_date?: string;
}

readonly sets: Signal<CardSetInfo[]>;
// GET cardsets.php au démarrage, trié par tcg_date desc
```

### `DeckStore`

```ts
private static KEY = 'yugioh.decks.v1';

readonly decks: Signal<Deck[]>;       // synchronisé avec localStorage

get(id): Deck | undefined;
create(name: string): Deck;            // crée + redirection gérée par le caller
rename(id: string, name: string): void;
remove(id: string): void;
addCard(deckId, section: DeckSectionId, card: Daum): void;
removeCard(deckId, section: DeckSectionId, cardId: number): void;
```

Chaque mutation persiste immédiatement dans `localStorage`. Parsing défensif au load (try/catch → liste vide si corrompu).

### `YuGiService` (étendu)

Ajout au type `CardQuery` : `set?: string`. Quand fourni, ajoute `cardset` aux params HTTP.

## 7. Règles de deckbuilding

### Routage automatique

```ts
function isExtraDeckMonster(card: Daum): boolean {
  const ft = (card.frameType || '').toLowerCase();
  return ft.startsWith('fusion') || ft.startsWith('synchro')
      || ft.startsWith('xyz')    || ft.startsWith('link');
}

function defaultSectionFor(card: Daum): 'main' | 'extra' {
  return isExtraDeckMonster(card) ? 'extra' : 'main';
}
```

### Validation à l'insertion (blocage dur)

`canAddCard(deck, section, card, banlist) → { allowed: boolean, reason?: string }`

Refuse si :

| Condition | Raison affichée |
|---|---|
| `banlist.get(card.id) === 'Banned'` | « Carte interdite en TCG » |
| `total ≥ banlist.maxCopies(card.id)` | « Limite de copies atteinte (Limitée/Semi/3) » |
| section = `main` et déjà 60 cartes | « Main Deck déjà à 60 cartes » |
| section = `extra` et carte non éligible Extra | « Cette carte ne va pas dans l'Extra Deck » |
| section = `main` et carte est Extra-only | « Cette carte va dans l'Extra Deck » |
| section = `extra` et déjà 15 cartes | « Extra Deck déjà à 15 cartes » |
| section = `side` et déjà 15 cartes | « Side Deck déjà à 15 cartes » |

`total` = somme des `count` pour ce `cardId` à travers `main + extra + side`.

### Validation continue (affichage)

`validateDeck(deck, banlist) → DeckIssue[]`

```ts
type DeckIssue = {
  kind: 'main-too-small' | 'main-too-large' | 'extra-too-large'
      | 'side-too-large' | 'forbidden-present' | 'over-limit-copies'
      | 'too-many-copies',
  severity: 'error' | 'warning',
  message: string,
  cardId?: number,
}
```

Seul `main-too-small` (< 40) est un `warning` ; tout le reste est `error`. Les blocages durs empêchent en pratique d'arriver dans ces états via l'UI, mais `validateDeck` reste robuste si la ban list change entre deux sessions pour un deck déjà sauvegardé.

### Indicateurs UI

- **Compteurs de section** (`DeckSection`) : rouge si hors limite (`< 40` ou `> 60` pour Main, `> 15` pour Extra/Side), neutre sinon.
- **Panel validité** (`DeckPanel`) : ✓ « Deck valide » ou liste des `DeckIssue` (⚠ warning, ⛔ error).
- **Badges sur les cartes** (`CardGrid`) : superposition top-right si `banlist.get(card.id)` défini.
  - Rouge `INTERDITE` pour `Banned`
  - Orange `LIMITÉE` pour `Limited`
  - Jaune `SEMI` pour `Semi-Limited`

## 8. Persistance

Clé `localStorage` : `yugioh.decks.v1` (versionnée pour migration future).

Schéma sérialisé : tableau de `Deck` (cf. section 5). Lecture défensive : try/catch, retour à `[]` si parse échoue ou si le format n'est pas un tableau.

## 9. UX des pages

### `/decks` — `DeckListPage`

- **Header** : titre « Mes decks », sous-titre « N decks sauvegardés ».
- **État vide** : carte centrale « Aucun deck pour l'instant » + bouton `+ Créer mon premier deck`.
- **Liste** : grille responsive de cartes de deck. Chaque carte affiche :
  - Nom (clic → `/decks/:id`).
  - Aperçu : 3 mini vignettes empilées des premières cartes du Main Deck, ou icône générique si vide.
  - Compteur `42 cartes`.
  - Date relative « modifié il y a 3 jours ».
  - Menu kebab `⋮` : **Renommer** (`prompt` pré-rempli), **Supprimer** (`confirm`).
- **Bouton `+ Nouveau deck`** en haut à droite : `prompt` pour le nom → `DeckStore.create(name)` → `router.navigate(['/decks', newDeck.id])`.

### `/decks/:id` — `DeckBuilderPage`

- Au chargement : `route.paramMap` → `DeckStore.get(id)` → redirection `/decks` si introuvable.
- **Layout ≥ 1100px** : 2 colonnes.
  - Gauche : `YuGiFilters` + pagination + `CardGrid`.
  - Droite : `DeckPanel`.
- **Layout < 1100px** : 1 colonne, filtres et grille en haut, `DeckPanel` en bas avec scroll interne.
- **Nom du deck** : éditable inline dans `DeckPanel` (clic → input → blur ou Enter sauve).
- Toute action (ajout, retrait, renommage) → `DeckStore` → persistance immédiate.

## 10. Style visuel

- Reprend la direction visuelle existante (frames colorés selon `frameType`, ambient `hieroglyphs`/`embers`, holo card directive).
- `DeckPanel` : palette sombre cohérente, cadre légèrement éclairé pour démarquer.
- Vignettes de deck : ~72px carrées, coin arrondi, badge `×N` superposé bas-droite si `count > 1`.
- Badges ban list : pill compact en haut-droite des cartes de la grille.

## 11. Responsive

V1 : breakpoint unique ~1100px (2 col → 1 col). Pas de polish mobile dédié mais l'UI doit rester utilisable sur tablette portrait.

## 12. Tests

Vitest configuré dans le projet. Cibles V1 (logique métier uniquement, pas de tests de composants) :

- `BanlistService.maxCopies` — mapping des 4 cas (Banned/Limited/Semi/none).
- `DeckStore` — `create`, `rename`, `remove`, `addCard`, `removeCard` ; vérifier que `localStorage` est mis à jour.
- `canAddCard` — chaque ligne du tableau de la section 7.
- `validateDeck` — deck vide, deck < 40, deck = 40, deck = 60, deck > 60, ban list changeante, copies > 3.
- `isExtraDeckMonster` / `defaultSectionFor` — chaque type de frame.

## 13. Ordre d'implémentation

1. Modèle `Deck` + utils `isExtraDeckMonster` / fonctions de validation pure (avec tests).
2. `BanlistService` + `SetService`.
3. `DeckStore` avec persistance + tests.
4. Extension `YuGiFilters` (champ set) + extension `CardQuery` (`set?`).
5. Extraction de `CardGrid` (+ badges ban list) et `AppHeader`.
6. `DeckListPage` + route `/decks`.
7. `DeckPanel` + `DeckSection` (composants visuels).
8. `DeckBuilderPage` + route `/decks/:id`.
9. Extension `YuGiCardDetail` (mode deckbuilder + boutons `+`).
10. Polish responsive + intégration finale du header partagé.

## 14. Hors scope V1

À noter pour ne pas dériver pendant l'implémentation :

- Import/export de deck (YDK, image, JSON partageable).
- URL partageable pour un deck.
- Statistiques du deck (courbe de niveaux, répartition monstres/magies/pièges).
- Drag & drop pour réorganiser les cartes dans une section.
- Modales custom à la place de `prompt()` / `confirm()`.
- Support OCG / Goat / sélecteur de format.
- Recherche au sein du deck.
- Édition du Side Deck façon « match » (échange Side ↔ Main entre duels).
