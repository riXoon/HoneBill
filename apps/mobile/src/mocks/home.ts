/** Mock data for the Home tab until the real balance/activity services are wired in. */
export type ActivityItem = {
  id: string;
  title: string;
  body: string;
  time: string;
};

export const mockHome = {
  name: 'Erickson Guhilde',
  onlineBalance: 800000,
  offlineBalance: 50000,
  activity: [
    { id: '1', title: 'Transfer received from Aaron Gabriel Chavez', body: 'Aaron Gabriel Chavez sent you ₱125,000', time: '25m ago' },
    { id: '2', title: 'Transfer received from Nicole Mayo', body: 'Nicole Mayo sent you ₱125,000', time: '24m ago' },
    { id: '3', title: 'Transfer received from Danica Manlangit', body: 'Danica Manlangit sent you ₱125,000', time: '21m ago' },
  ] as ActivityItem[],
};

/** 100000 -> { whole: "100,000", cents: "00" } */
export function splitPesos(amount: number): { whole: string; cents: string } {
  const [whole, cents] = amount.toFixed(2).split('.');
  return { whole: whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','), cents };
}
