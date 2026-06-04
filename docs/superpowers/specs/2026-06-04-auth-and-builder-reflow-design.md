# Auth + Deck Builder Reflow — Design

**Date** : 2026-06-04
**Statut** : validé par l'utilisateur, prêt à passer au plan d'implémentation
**Précédent** : `2026-06-04-deckbuilder-design.md` (V1 du deckbuilder, sans auth)

## 1. Objectif

Ajouter une authentification simulée côté client (register/login) à l'app Angular Yu-Gi-Oh, scoper les decks par utilisateur, et restructurer le flux d'édition pour qu'il s'appuie sur un brouillon explicite avec bouton « Enregistrer » manuel.

L'app reste 100 % côté client (pas de backend). Les utilisateurs et les decks vivent dans `localStorage`.

## 2. Décisions de cadrage

| Décision | Choix |
|---|---|
| Backend | Aucun — auth simulée côté client, `localStorage` |
| Champs user | username + email + password |
| UX login/register | Pages dédiées `/login` et `/register` |
| Flux Deck Builder | Brouillon courant + bouton Enregistrer manuel (pas d'auto-save) |
| Édition deck existant | Charger dans le brouillon avec `linkedDeckId` → Enregistrer écrase |
| Non connecté | Header masque les boutons protégés ; routes redirigent vers `/login` |
| Header connecté | « Bonjour {username} · Déconnexion » à côté de la nav |

## 3. Routes & navigation

| Route | Composant | Accès | Rôle |
|---|---|---|---|
| `/` | `YuGiIndex` | Public | Catalogue / consultation (inchangé) |
| `/login` | `LoginPage` (nouveau) | Public — redirige vers `/` si déjà connecté | Formulaire de connexion |
| `/register` | `RegisterPage` (nouveau) | Public — idem | Formulaire d'inscription |
| `/deck-builder` | `DeckBuilderPage` (réécrit) | Protégée → `/login?returnTo=/deck-builder` | Éditeur avec brouillon + bouton Enregistrer |
| `/decks` | `DeckListPage` (existant, scoped par user) | Protégée | Liste des decks du user connecté |

L'ancienne route `/decks/:id` **disparaît**. L'édition d'un deck sauvegardé passe par : clic sur le deck dans `/decks` → `DraftService.load(deck)` → `router.navigate(['/deck-builder'])`. Le bouton change de label (« Mettre à jour » au lieu de « Enregistrer ») tant que le brouillon est lié.

**Header** (`AppHeader`, affichage conditionnel via `AuthService.session()`) :

- **Pas de session** : `[Logo] · Catalogue · Connexion · Inscription`
- **Session active** : `[Logo] · Catalogue · Deck Builder · Mes decks · Bonjour {username} · Déconnexion`

## 4. Modèle utilisateur & sécurité

### Modèle (`src/app/models/user.ts`)

```ts
export interface User {
  id: string;            // crypto.randomUUID()
  username: string;      // affiché, unique (case-insensitive)
  email: string;         // unique (case-insensitive)
  passwordHash: string;  // hex SHA-256(salt + password)
  salt: string;          // hex, 16 bytes
  createdAt: number;
}

export interface Session {
  userId: string;
  username: string;      // dénormalisé pour affichage rapide
}
```

### Hash du mot de passe

Via Web Crypto API :

1. À l'inscription : générer `salt = 16 bytes aléatoires (crypto.getRandomValues)`, calculer `passwordHash = SHA-256(salt + password)`, stocker `{ passwordHash, salt }` en hex.
2. Au login : récupérer le user par username ou email, recalculer `SHA-256(stored.salt + password)`, comparer en `===`.

**Note pédagogique** : SHA-256 est trop rapide pour un vrai cas prod (brute-force facile). Le bon choix prod serait Argon2 / bcrypt côté backend. Ce design assume le contexte « sans backend » comme acceptable pour un projet de formation. Un commentaire explicatif sera ajouté en tête du fichier `AuthService` pour expliquer ce trade-off.

### Persistance

| Clé `localStorage` | Contenu |
|---|---|
| `yugioh.users.v1` | `User[]` |
| `yugioh.session.v1` | `Session \| null` |
| `yugioh.decks.v1` | `Deck[]` (avec `ownerId`) — clé existante, schéma étendu |
| `yugioh.draft.{userId}.v1` | `Draft` (un par user) |

Lecture défensive de toutes les clés (try/catch + retour valeur vide si parse échoue).

## 5. Scoping des decks par utilisateur

### Modèle (`src/app/models/deck.ts`, modifié)

Un seul champ ajouté :

```ts
export interface Deck {
  id: string;
  ownerId: string;       // NEW — User.id du créateur
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  createdAt: number;
  updatedAt: number;
}
```

### `DeckStore` (modifié)

```ts
// API publique
readonly decks: Signal<Deck[]>;     // tous les decks bruts (interne, peu utile)
readonly myDecks: Signal<Deck[]>;   // NEW — filtré par AuthService.currentUserId()

get(id): Deck | undefined;          // retourne undefined si ownerId !== currentUserId
create(name): Deck | null;          // retourne null si pas de session
rename(id, name): void;             // no-op si pas owner
remove(id): void;                   // no-op si pas owner
addCard(id, section, card): void;   // no-op si pas owner
removeCard(id, section, cardId): void; // no-op si pas owner
replaceContents(id, content): void; // remplace name + main + extra + side d'un coup, no-op si pas owner

interface DeckContent {
  name: string;
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
}
```

Les vérifications de propriété sont silencieuses (pas d'exception) — c'est l'UI qui doit déjà avoir empêché l'action via `authGuard` et le filtrage `myDecks`.

### Pas de migration des decks pré-auth

Les decks créés en V1 (sans `ownerId`) deviennent inaccessibles à l'écran après l'ajout de l'auth (ils restent en storage mais `myDecks` ne les liste pas car `ownerId` est `undefined ≠ currentUserId`). On documente ce comportement ; en pratique l'app n'a pas encore d'utilisateurs réels et le storage local sera vidé à la prochaine session de dev.

Pour éviter d'avoir des données « zombies » qui occupent la place, on ajoute une étape `cleanupOrphanedDecks()` au démarrage de `DeckStore` qui supprime les decks sans `ownerId`. Comportement simple, documenté dans le code.

## 6. Brouillon (`DraftService`)

### Modèle

```ts
interface Draft {
  name: string;                  // peut être '' tant que pas Enregistré
  main: DeckCard[];
  extra: DeckCard[];
  side: DeckCard[];
  linkedDeckId?: string;         // si on édite un deck existant
}
```

### API du `DraftService`

```ts
readonly draft: Signal<Draft>;
readonly isDirty: Signal<boolean>;   // true si draft a au moins une carte ou un nom

setName(name: string): void;
addCard(section: DeckSectionId, card: Daum): void;
removeCard(section: DeckSectionId, cardId: number): void;

load(deck: Deck): void;              // copie un Deck sauvegardé dans le draft
reset(): void;                        // draft vide
save(): SaveResult;                   // crée ou met à jour selon linkedDeckId

type SaveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'no-session' | 'no-name' | 'invalid' };
```

### Persistance

- Au démarrage du service : lecture de `yugioh.draft.{currentUserId}.v1` si session active, sinon brouillon vide.
- Chaque mutation écrit immédiatement dans `localStorage` (un effet qui réagit au signal `draft`).
- À chaque changement de session (login/logout via signal `AuthService.currentUserId`), le service recharge depuis le storage du nouvel user (ou repart vide si logout).

### Logique de `save()`

1. Si pas de session → `{ ok: false, reason: 'no-session' }`.
2. Si `name.trim() === ''` → `{ ok: false, reason: 'no-name' }`.
3. Si `validateDeck()` retourne au moins une erreur (severity `'error'`) → `{ ok: false, reason: 'invalid' }`. Les warnings (deck < 40) sont OK.
4. Si `linkedDeckId` est défini : `DeckStore.replaceContents(linkedDeckId, { name, main, extra, side })`.
5. Sinon : `DeckStore.create(name)` puis `DeckStore.replaceContents(deck.id, { name, main, extra, side })`. Le draft garde son `linkedDeckId` après ça (on enregistre `deck.id` dedans pour que les saves suivants soient des updates).
6. Retourner `{ ok: true, id }`.

## 7. Authentification (`AuthService`)

```ts
readonly session: Signal<Session | null>;
readonly currentUserId: Signal<string | null>;  // computed: session()?.userId ?? null

register(input: { username: string; email: string; password: string }):
  Promise<RegisterResult>;
login(input: { usernameOrEmail: string; password: string }):
  Promise<LoginResult>;
logout(): void;

type RegisterResult =
  | { ok: true; user: User }
  | { ok: false; reason: 'username-taken' | 'email-taken' | 'invalid-fields' };

type LoginResult =
  | { ok: true; session: Session }
  | { ok: false; reason: 'invalid-credentials' };
```

Comportements :
- `register()` valide les champs côté service (longueur, regex email), vérifie l'unicité (case-insensitive) parmi `yugioh.users.v1`, génère salt + hash, persiste, **ouvre automatiquement la session** en retournant un succès. Promise car SHA-256 est async via Web Crypto.
- `login()` cherche par username OU email (case-insensitive), recalcule le hash, compare. Si OK, set la session ; sinon `invalid-credentials` (générique).
- `logout()` met `session` à null, supprime `yugioh.session.v1`. Pas de redirect — l'appelant gère.

Au démarrage, le service lit `yugioh.session.v1` et initialise `session` (try/catch défensif).

## 8. Guard `authGuard`

Fonctionnelle (`CanActivateFn`), appliquée aux routes `/deck-builder` et `/decks` :

```ts
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.session()) return true;
  router.navigate(['/login'], { queryParams: { returnTo: state.url } });
  return false;
};
```

Et symétriquement, `guestOnlyGuard` pour `/login` et `/register` (si déjà connecté → redirect `/`).

Après login/register réussi, `LoginPage`/`RegisterPage` lisent `route.snapshot.queryParamMap.get('returnTo')` et naviguent dessus (sinon `/`).

## 9. Composants

### Nouveaux

| Composant | Rôle |
|---|---|
| `LoginPage` (`pages/login/`) | Form avec champ « Username ou email » + « Mot de passe », bouton « Se connecter », lien vers `/register`. Erreur générique sur mauvais credentials. |
| `RegisterPage` (`pages/register/`) | Form avec username, email, password, password-confirm. Erreurs inline par champ. Au succès → redirect vers `returnTo` ou `/`. |
| `Toast` (`components/toast/`) | Notification éphémère (auto-dismiss 3s), exposée via un `ToastService` simple. Utilisé pour « Deck enregistré ✓ », « Connecté ✓ », etc. |

### Modifiés

| Composant | Changements |
|---|---|
| `AppHeader` | Affichage conditionnel selon `auth.session()`. Bouton « Déconnexion » appelle `auth.logout()` puis navigate `/`. |
| `DeckPanel` | Input nom (au lieu du h2 cliquable), bouton « Enregistrer » / « Mettre à jour » / « Nouveau ». Plus d'event `rename` ; au lieu : `(nameChange)`, `(saveRequest)`, `(newRequest)`. |
| `DeckBuilderPage` | Réécrit : plus de route `:id`, plus de `DeckStore.get(id)`. État porté par `DraftService`. Au clic « Enregistrer » : appel `draft.save()`, gestion des `SaveResult`. |
| `DeckListPage` | Filtre via `DeckStore.myDecks`. Clic sur un deck : `draftService.load(deck)` → router.navigate `/deck-builder`. |
| `DeckStore` | Voir Section 5. |
| `app.routes.ts` | Routes `/login`, `/register`, `/deck-builder` ajoutées avec guards ; `/decks/:id` supprimée. |

## 10. Validation des formulaires

### `RegisterPage`

| Champ | Règles |
|---|---|
| `username` | non vide, 3-20 caractères, `^[A-Za-z0-9_-]+$`, unique case-insensitive |
| `email` | regex `^\S+@\S+\.\S+$`, unique case-insensitive |
| `password` | ≥ 8 caractères |
| `passwordConfirm` | identique à `password` |

Validation à la soumission et au resubmit (pas de `(blur)` agressif). Erreurs affichées sous chaque champ. Au succès → login automatique → redirect.

### `LoginPage`

Présence des champs uniquement. Erreur générique « Identifiant ou mot de passe incorrect ».

## 11. UI

### Style

Les pages `/login` et `/register` reprennent l'ambient existant (hieroglyphs, embers) avec un cadre centré (~400px) en palette dorée/sombre. Le formulaire utilise les mêmes inputs et boutons que l'UI existante (cohérence visuelle).

### Toast

Composant `<app-toast />` placé à la racine de `App` (au-dessus du `<router-outlet>`). Lit le signal `ToastService.current`. Auto-dismiss après 3 secondes via `setTimeout` dans le service. Trois niveaux : `info`, `success`, `error` (avec couleur de bordure correspondante).

```ts
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current: Signal<Toast | null>;
  show(message: string, level?: 'info' | 'success' | 'error'): void;
}

interface Toast { id: string; message: string; level: 'info' | 'success' | 'error'; }
```

## 12. Tests

Vitest, cibles V1 (logique métier — pas de tests de composants) :

- `AuthService`
  - `register` succès → session active, user persisté
  - `register` username déjà pris → `username-taken`
  - `register` email déjà pris → `email-taken`
  - `register` champs invalides → `invalid-fields`
  - `login` par username, par email, succès dans les deux cas
  - `login` mauvais mot de passe → `invalid-credentials`
  - `login` user inexistant → `invalid-credentials`
  - `logout` → session null + storage cleared
  - Session restaurée au reload (`localStorage.session.v1` présent → service init avec)

- `DraftService`
  - `addCard` modifie le draft
  - `load(deck)` initialise `linkedDeckId`
  - `save()` sans session → `no-session`
  - `save()` sans nom → `no-name`
  - `save()` deck invalide (banlist) → `invalid`
  - `save()` sans `linkedDeckId` → crée un Deck dans le store
  - `save()` avec `linkedDeckId` → met à jour le Deck existant
  - Changement de session (signal currentUserId) → reload du brouillon depuis le storage du nouveau user

- `DeckStore.myDecks`
  - Retourne `[]` si pas de session
  - Filtre correctement par `ownerId`
  - `cleanupOrphanedDecks` supprime les decks sans `ownerId`
  - `replaceContents` écrase les sections d'un deck possédé
  - `replaceContents` est un no-op sur un deck dont on n'est pas owner

- `authGuard` / `guestOnlyGuard`
  - Bloquent / laissent passer selon la session

## 13. Ordre d'implémentation

1. `AuthService` (avec tests) — fondation, tout dépend de son signal `session`
2. `LoginPage` + `RegisterPage` + routes `/login` et `/register`
3. `authGuard` + `guestOnlyGuard` + application aux routes existantes
4. `AppHeader` — bascule logué/non logué
5. `Deck.ownerId` + refactor `DeckStore` (champs `myDecks`, vérifs ownership, `cleanupOrphanedDecks`)
6. `DraftService` (avec tests)
7. `Toast` + `ToastService`
8. Refactor `DeckBuilderPage` autour du draft (suppression route `:id`)
9. Refactor `DeckPanel` (input nom + boutons save/update/new)
10. Refactor `DeckListPage` (clic → load draft → navigate)
11. Polish + verif e2e manuels des flux complets

## 14. Hors scope V1

- Reset password / forgot password
- Email verification (pas d'envoi de mail)
- Page profil / changement de mot de passe / changement de username
- OAuth (Google, Discord, etc.)
- Decks publics / partage par URL
- Migration des decks pré-auth (les decks sans `ownerId` sont nettoyés au démarrage)
- Dialog « tu as un brouillon non sauvegardé » au logout (on accepte de garder silencieusement en `localStorage` ; un re-login restaure)
