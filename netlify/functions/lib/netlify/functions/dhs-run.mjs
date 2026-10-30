import { runMedicao } from './lib/run.mjs';

// Medição completa (lê o HubSpot inteiro). Roda em segundo plano, até 15 minutos.
export default async () => {
  await runMedicao();
};

export const config = { background: true, path: '/api/run-bg' };
