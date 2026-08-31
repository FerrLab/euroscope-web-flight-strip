import type * as React from 'react';

type ObiIconProps = React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'obi-history-google': ObiIconProps;
      'obi-more-vertical-google': ObiIconProps;
      'obi-close-google': ObiIconProps;
      'obi-warning-google': ObiIconProps;
      'obi-not-allowed': ObiIconProps;
      'obi-arrow-right-google': ObiIconProps;
      'obi-arrow-bidirectional-horizontal': ObiIconProps;
      'obi-check-google': ObiIconProps;
      'obi-com-message-google': ObiIconProps;
      'obi-edit-google': ObiIconProps;
      'obi-delete-filled': ObiIconProps;
      'obi-screen-split-bottom': ObiIconProps;
      'obi-caution-google': ObiIconProps;
      'obi-command-locked': ObiIconProps;
      'obi-command-available': ObiIconProps;
      'obi-palette-day-bright': ObiIconProps;
      'obi-palette-day': ObiIconProps;
      'obi-palette-dusk': ObiIconProps;
      'obi-palette-night': ObiIconProps;
    }
  }
}
