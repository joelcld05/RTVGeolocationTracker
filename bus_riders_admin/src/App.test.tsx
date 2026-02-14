import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store';

test('renders login panel by default', async () => {
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  const headingElement = await screen.findByText(/route manager/i);
  expect(headingElement).toBeInTheDocument();
});
