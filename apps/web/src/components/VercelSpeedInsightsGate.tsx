import { SpeedInsights } from '@vercel/speed-insights/next';

/** Only loads when `NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS=1` (matches dashboard toggle; avoids extra script locally). */
export function VercelSpeedInsightsGate() {
  if (process.env.NEXT_PUBLIC_VERCEL_SPEED_INSIGHTS !== '1') return null;
  return <SpeedInsights />;
}
