import { redirect } from 'next/navigation';

/** Staff discount card is not ready for general release; keep route stable for bookmarks. */
export default function DiscountPage() {
  redirect('/dashboard');
}
