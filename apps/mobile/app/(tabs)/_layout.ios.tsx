import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { DynamicColorIOS } from 'react-native';

/**
 * Native system tab bar (liquid-glass / material blur on supported iOS versions).
 * @see https://docs.expo.dev/router/advanced/native-tabs/
 */
export default function TabLayout() {
  const labelColor = DynamicColorIOS({ light: '#3a3a3c', dark: '#ebebf5' });
  const tint = DynamicColorIOS({ light: '#0f172a', dark: '#f8fafc' });

  return (
    <NativeTabs
      blurEffect="systemChromeMaterial"
      disableTransparentOnScrollEdge
      tintColor={tint}
      labelStyle={{ color: labelColor }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="broadcasts">
        <NativeTabs.Trigger.Label>Broadcasts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'megaphone', selected: 'megaphone.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="calendar">
        <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'calendar', selected: 'calendar.circle.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="rota">
        <NativeTabs.Trigger.Label>Rota</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.clipboard', selected: 'list.bullet.clipboard.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="discount">
        <NativeTabs.Trigger.Label>Discount</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'ticket', selected: 'ticket.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
