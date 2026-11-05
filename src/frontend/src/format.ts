const dateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export const formatPrice = (price: number | null) =>
  price == null ? null : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }).format(price);
