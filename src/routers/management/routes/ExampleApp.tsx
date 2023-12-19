import { ReactElement, useCallback, useRef } from 'react';
import { useWritableValueWithCallbacks } from '../../../lib/Callbacks';
import { setVWC } from '../../../uikit/lib/setVWC';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';
import styles from './ExampleApp.module.css';
import { usePlausibleEvent } from '../../../uikit/hooks/usePlausibleEvent';
import { sendPlausibleEvent } from '../../../uikit/lib/sendPlausibleEvent';

export type ExampleAppProps = {
  initialTodos: string[];
  stylesheets: string[];
};

/**
 * The component to render for the example route. This is rendered on the
 * server and also included in the build for the client, so it's important
 * to be careful about the imports on this file
 */
export const ExampleApp = ({ initialTodos, stylesheets }: ExampleAppProps): ReactElement => {
  usePlausibleEvent('pageview--frontend-ssr-web/routers/management/routes/ExampleApp.tsx', {
    name: 'pageview',
    componentPath: 'frontend-ssr-web/routers/management/routes/ExampleApp.tsx',
    props: { initialTodos: initialTodos.join(',') },
  });

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href="/fonts.css" />
        {stylesheets.map((href, i) => (
          <link key={i} rel="stylesheet" href={href} />
        ))}
        <title>Example</title>
      </head>
      <body>
        <div id="root">
          <div className={styles.container}>
            <div className={styles.innerContainer}>
              <div className={styles.content}>
                <h1 className={styles.title}>Example</h1>
                <p className={styles.body}>
                  This is an example HTML page to show rendering via react.
                </p>
                <TodoList initial={initialTodos} />
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
};

const TodoList = ({ initial }: { initial: string[] }): ReactElement => {
  const todosVWC = useWritableValueWithCallbacks<string[]>(() => [...initial]);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const input = inputRef.current;
      if (input == null) {
        return;
      }

      const value = input.value;
      if (value.length < 1) {
        return;
      }

      sendPlausibleEvent(undefined, {
        name: 'frontend-ssr-web/example/TodoList--add',
      });

      setVWC(todosVWC, [...todosVWC.get(), value]);
      input.value = '';
    },
    [todosVWC]
  );

  return (
    <div className={styles.todos}>
      <h2 className={styles.todosTitle}>Todo List</h2>
      <ul className={styles.todosList}>
        <RenderGuardedComponent
          props={todosVWC}
          component={(todos) => (
            <>
              {todos.map((todo, i) => (
                <li className={styles.todoItem} key={i}>
                  {todo}
                </li>
              ))}
            </>
          )}
        />
        <form onSubmit={handleSubmit}>
          <input type="text" ref={inputRef} />
          <button type="submit">Add</button>
        </form>
      </ul>
    </div>
  );
};

export default ExampleApp;
