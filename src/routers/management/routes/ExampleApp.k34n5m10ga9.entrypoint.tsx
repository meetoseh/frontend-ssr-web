import { hydrateRoot } from 'react-dom/client';
import App from './ExampleApp';

const bundledProps = {};
const props = Object.assign(
  {},
  bundledProps,
  (window as any)['__INITIAL_PROPS__']
);
hydrateRoot(document, <App {...props} />);
