/**
 * A string representing the type of environment the application is currently running in
 * popup - When the user click's the icon in their browser's extension bar; the default view
 * notification - When the extension opens due to interaction with a Web3 enabled website
 * fullscreen - When the user clicks 'expand view' to open the extension in a new tab
 * background - The background process that powers the extension
 */
export type EnvironmentType =
  | 'popup'
  | 'notification'
  | 'fullscreen'
  | 'background';

export const ENVIRONMENT_TYPE_BACKGROUND = 'background';
