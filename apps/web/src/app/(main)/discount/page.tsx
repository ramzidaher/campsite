import { redirect } from 'next/navigation';

/** Legacy route kept only to redirect old bookmarks. */
export default function DiscountPage() {
  redirect('/dashboard');
}
