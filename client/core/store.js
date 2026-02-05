import { fromJS } from 'immutable'
import { applyMiddleware, compose, createStore } from 'redux'
import { createReduxHistoryContext } from 'redux-first-history'
import createSagaMiddleware, { END } from 'redux-saga'
import { createBrowserHistory } from 'history'

import root_saga from './sagas'
import root_reducer from './reducers'

const saga_middleware = createSagaMiddleware()
const initial_state = window.__INITIAL_STATE__

const compose_enhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose

const redux_history_context = createReduxHistoryContext({
  history: createBrowserHistory(),
  selectRouterState: (state) => state.get('router')
})

const { createReduxHistory, routerMiddleware, routerReducer } =
  redux_history_context

// ======================================================
// Middleware Configuration
// ======================================================
const middlewares = [saga_middleware, routerMiddleware]

// ======================================================
// Store Enhancers
// ======================================================
const enhancers = [applyMiddleware(...middlewares)]

// ======================================================
// Store Instantiation and HMR Setup
// ======================================================
export const store = createStore(
  root_reducer(routerReducer),
  fromJS(initial_state),
  compose_enhancers(...enhancers)
)

saga_middleware.run(root_saga)
store.close = () => store.dispatch(END)

if (module.hot) {
  // Enable webpack hot module replacement for reducers
  module.hot.accept('./reducers', () => {
    const next_reducers = root_reducer(routerReducer)
    store.replaceReducer(next_reducers)
  })
}

export const history = createReduxHistory(store)
