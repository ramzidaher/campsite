import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  seed: number[][];
  size?: number;
};

export function PlaceholderQrGrid({ seed, size = 104 }: Props) {
  const cell = useMemo(() => size / seed.length, [seed.length, size]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {seed.map((row, ri) =>
        row.map((bit, ci) => (
          <View
            key={`${ri}-${ci}`}
            style={{
              width: cell,
              height: cell,
              backgroundColor: bit ? '#121212' : '#ffffff',
            }}
          />
        )),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    borderRadius: 2,
  },
});
