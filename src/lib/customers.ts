import { Customer } from '../types';

const key = (s: string) => s.trim().toLocaleLowerCase('tr');

/** Ada göre (büyük/küçük harf ve baştaki/sondaki boşluk farkı gözetmeden) kayıtlı müşteriyi bulur. */
export function findCustomer(customers: Customer[] = [], name: string): Customer | undefined {
  const k = key(name);
  if (!k) return undefined;
  return customers.find((c) => key(c.name) === k);
}
