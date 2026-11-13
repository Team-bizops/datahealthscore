// Dispara a medição todo dia às 06:00, 12:00 e 16:00 (Brasília) = 09:00, 15:00 e 19:00 UTC.
export default async () => {
  const base = Netlify.env.get('URL');
  await fetch(`${base}/api/run-bg`, { method: 'POST', headers: { 'x-dhs-origem': 'agendado' } });
};

export const config = { schedule: '0 9,15,19 * * *' };
