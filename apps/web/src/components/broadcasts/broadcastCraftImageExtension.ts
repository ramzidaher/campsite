import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';

/**
 * Block images with a soft “card” frame (Craft-style), stored as `![alt](url)` in markdown.
 */
export const BroadcastCraftImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      class: 'broadcast-craft-image-img',
      loading: 'lazy',
      decoding: 'async',
    });
    return ['figure', { class: 'broadcast-craft-image-frame' }, ['img', imgAttrs]];
  },

  parseHTML() {
    return [
      { tag: 'figure.broadcast-craft-image-frame img' },
      {
        tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])',
      },
    ];
  },
});
