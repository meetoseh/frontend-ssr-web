import { ReactElement, useCallback, useRef } from 'react';
import { useWritableValueWithCallbacks } from '../../../lib/Callbacks';
import { setVWC } from '../../../uikit/lib/setVWC';
import { RenderGuardedComponent } from '../../../uikit/components/RenderGuardedComponent';

/**
 * The component to render for the example route. This is rendered on the
 * server and also included in the build for the client, so it's important
 * to be careful about the imports on this file
 */
export const ExampleApp = (): ReactElement => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Example</title>
      </head>
      <body>
        <div id="root">
          <h1>Example</h1>
          <p>This is an example HTML page to show rendering via react.</p>
          <TodoList />
        </div>
      </body>
    </html>
  );
};

const TodoList = (): ReactElement => {
  const todosVWC = useWritableValueWithCallbacks<string[]>(() => ['Buy milk', 'Buy eggs']);
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

      setVWC(todosVWC, [...todosVWC.get(), value]);
      input.value = '';
    },
    [todosVWC]
  );

  return (
    <div>
      <h2>Todo List</h2>
      <ul>
        <RenderGuardedComponent
          props={todosVWC}
          component={(todos) => (
            <>
              {todos.map((todo, i) => (
                <li key={i}>{todo}</li>
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
