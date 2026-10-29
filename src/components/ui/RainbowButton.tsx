import type { ComponentProps } from 'react';
import './rainbowButton.css';

/** Magic UI Rainbow Button adapted to native navigation links and plain CSS.
 * Source: https://magicui.design/r/rainbow-button.json (MIT).
 */
export function RainbowButton({ variant = 'default', className = '', ...props }: ComponentProps<'a'> & { variant?: 'default' | 'outline' }) {
  return <a className={`rainbow-button ${className}`} data-variant={variant} {...props} />;
}
