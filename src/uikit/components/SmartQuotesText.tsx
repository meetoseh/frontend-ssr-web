import { ReactElement } from 'react';

type SmartQuotesProps = {
  /**
   * The text to replace ' with ’
   */
  children: string;
};

export const RIGHT_SINGLE_QUOTE = String.fromCharCode(8217);

/**
 * Returns a fragment containing the child but with quotes replaced
 * with their curly variants
 */
export const SmartQuotesText = ({ children }: SmartQuotesProps): ReactElement => {
  const replaced = children.replace(/'/g, RIGHT_SINGLE_QUOTE);

  return <>{replaced}</>;
};
