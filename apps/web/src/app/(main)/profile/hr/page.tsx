import { redirect } from 'next/navigation';

/** @deprecated Use `/profile` — kept so old links and bookmarks keep working. */
export default function LegacyMyHrRecordRedirect() {
  redirect('/profile');
}
