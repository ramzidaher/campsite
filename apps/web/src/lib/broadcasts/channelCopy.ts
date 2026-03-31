/**
 * User-visible strings for broadcast channels (audience lists per department).
 * Database: `public.broadcast_channels`, `broadcasts.channel_id`, `user_subscriptions.channel_id`.
 */

export const settingsBroadcastChannelsTitle = 'Broadcast channels';

export const settingsBroadcastChannelsHelp =
  'Targeted broadcasts only reach members who follow that channel for the department. Mandatory and org-wide sends bypass channel follows.';

export const composeChannelLabel = 'Channel';

export const composeChannelExplainer =
  'Members only see this if they follow this channel for this department (unless the send is Mandatory or Org-wide).';

export const composeManageChannelsInSettings = 'Manage which channels you follow in Settings.';

export const composeNoChannelsHint = (deptLabel: string) =>
  `Add broadcast channels in Admin → Departments for “${deptLabel}”, then refresh this page.`;

export const adminDepartmentsChannelsHeading = 'Broadcast channels';

export const adminDepartmentsChannelsHint =
  'Channels define who can receive targeted posts, not just labels on the feed.';

export const registrationWizardChannelsStep = 'Channels';

export const registrationChannelsTitle = 'Broadcast channels';

export const registrationChannelsBody =
  'Choose channels you want to follow under each team or department. You can change these later in Settings.';

export const channelPillAccessibleName = (channelName: string) => `Broadcast channel: ${channelName}`;

export const adminBroadcastsFilterChannelAria = 'Channel';
