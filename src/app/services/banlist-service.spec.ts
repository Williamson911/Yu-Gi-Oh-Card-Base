import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { BanlistService } from './banlist-service';

describe('BanlistService', () => {
  function setup(response: any) {
    const http = { get: vi.fn().mockReturnValue(of(response)) } as unknown as HttpClient;
    TestBed.configureTestingModule({
      providers: [BanlistService, { provide: HttpClient, useValue: http }],
    });
    return TestBed.inject(BanlistService);
  }

  it('builds a Map from cardinfo.php?banlist=tcg payload', () => {
    const service = setup({
      data: [
        { id: 1, banlist_info: { ban_tcg: 'Banned' } },
        { id: 2, banlist_info: { ban_tcg: 'Limited' } },
        { id: 3, banlist_info: { ban_tcg: 'Semi-Limited' } },
        { id: 4, banlist_info: {} },
      ],
    });
    expect(service.get(1)).toBe('Banned');
    expect(service.get(2)).toBe('Limited');
    expect(service.get(3)).toBe('Semi-Limited');
    expect(service.get(4)).toBeUndefined();
    expect(service.get(999)).toBeUndefined();
  });

  it('maxCopies returns 0/1/2/3 based on status', () => {
    const service = setup({
      data: [
        { id: 1, banlist_info: { ban_tcg: 'Banned' } },
        { id: 2, banlist_info: { ban_tcg: 'Limited' } },
        { id: 3, banlist_info: { ban_tcg: 'Semi-Limited' } },
      ],
    });
    expect(service.maxCopies(1)).toBe(0);
    expect(service.maxCopies(2)).toBe(1);
    expect(service.maxCopies(3)).toBe(2);
    expect(service.maxCopies(999)).toBe(3);
  });

  it('returns sane defaults when HTTP fails', () => {
    const http = {
      get: vi.fn().mockImplementation(() => {
        throw new Error('boom');
      }),
    } as unknown as HttpClient;
    TestBed.configureTestingModule({
      providers: [BanlistService, { provide: HttpClient, useValue: http }],
    });
    const service = TestBed.inject(BanlistService);
    expect(service.maxCopies(42)).toBe(3);
  });
});
