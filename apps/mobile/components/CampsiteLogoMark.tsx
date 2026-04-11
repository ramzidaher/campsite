import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import CampsiteLogoSvg from '@/assets/images/campsite-logo.svg';

type Props = {
  /** Outer container (size, radius, background). */
  style?: StyleProp<ViewStyle>;
  /** Rendered SVG width/height (slightly smaller than the box for padding). */
  size: number;
};

export function CampsiteLogoMark({ style, size }: Props): ReactNode {
  const Logo = CampsiteLogoSvg;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}>
      <Logo width={size} height={size} />
    </View>
  );
}
