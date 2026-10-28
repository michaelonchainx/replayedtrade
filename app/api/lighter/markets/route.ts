import { lighterGet } from '@/lib/lighter/upstream';

export const revalidate = 3600;

export async function GET() {
  return lighterGet('orderBooks', {});
}
