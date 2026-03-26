import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type ViewProps } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export interface SkeletonProps extends ViewProps {
  height?: number;
  width?: number | string;
  radius?: number;
}

export function Skeleton({ height = 16, width = '100%', radius = 8, style, ...rest }: SkeletonProps) {
  const { tokens } = useCampsiteTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        styles.base,
        {
          height,
          width: width as number | `${number}%`,
          borderRadius: radius,
          backgroundColor: tokens.border,
          opacity,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
