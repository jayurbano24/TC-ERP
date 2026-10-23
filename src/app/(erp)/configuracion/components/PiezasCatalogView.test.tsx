import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PiezasCatalogView } from './PiezasCatalogView';

const apiMocks = vi.hoisted(() => ({
  fetchPartsCatalog: vi.fn(),
  adjustPartsStock: vi.fn(),
  savePartsCatalog: vi.fn(),
}));

vi.mock('@/lib/api/parts', () => apiMocks);

vi.mock('@/shared/catalogs/catalogs', () => ({
  getBrands: vi.fn().mockResolvedValue([
    { id: '11111111-1111-4111-8111-111111111111', name: 'ZTE' },
    { id: '22222222-2222-4222-8222-222222222222', name: 'Huawei' },
    { id: '33333333-3333-4333-8333-333333333333', name: 'Kaon' },
  ]),
  getModels: vi.fn().mockResolvedValue([
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'ZXV10', brand_id: '11111111-1111-4111-8111-111111111111' },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'HG8245', brand_id: '22222222-2222-4222-8222-222222222222' },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'CG2200', brand_id: '33333333-3333-4333-8333-333333333333' },
  ]),
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => cleanup());

describe('PiezasCatalogView', () => {
  beforeEach(() => {
    apiMocks.fetchPartsCatalog.mockResolvedValue([
      { id: 'part-1', sku: 'SKU-1', name: 'Pieza de prueba', active: true },
    ]);
    apiMocks.savePartsCatalog.mockResolvedValue({ item: { id: 'part-new' } });
    apiMocks.adjustPartsStock.mockResolvedValue({});
    vi.clearAllMocks();
  });

  it('ofrece desplazamiento horizontal para alcanzar todas las columnas', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PiezasCatalogView />
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText('Catálogo de piezas SKU')).toBeTruthy();
    expect(screen.getByLabelText('Desplazamiento horizontal superior')).toBeTruthy();
  });

  it('permite seleccionar varias marcas y solamente sus modelos', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <PiezasCatalogView />
      </QueryClientProvider>,
    );

    fireEvent.click(await view.findByRole('button', { name: /nueva pieza/i }));
    fireEvent.click(await view.findByLabelText('Marca ZTE'));
    fireEvent.click(view.getByLabelText('Marca Huawei'));

    expect(view.getByLabelText('Modelo ZXV10')).toBeTruthy();
    expect(view.getByLabelText('Modelo HG8245')).toBeTruthy();
    expect(view.queryByLabelText('Modelo CG2200')).toBeNull();

    fireEvent.click(view.getByLabelText('Modelo ZXV10'));
    fireEvent.click(view.getByLabelText('Modelo HG8245'));
    fireEvent.change(view.getByLabelText('SKU *'), { target: { value: 'USB-1' } });
    fireEvent.change(view.getByLabelText('Nombre *'), { target: { value: 'Puerto USB' } });
    fireEvent.click(view.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(apiMocks.savePartsCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        brand_ids: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
        model_ids: [
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ],
      }),
    ));
  });
});
