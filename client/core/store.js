import { fromJS } from 'immutable'
import { applyMiddleware, compose, createStore } from 'redux'
import { createReduxHistoryContext } from 'redux-first-history'
import createSagaMiddleware, { END } from 'redux-saga'
import { createBrowserHistory } from 'history'

import rootSaga from './sagas'
import root_reducer from './reducers'

const sagaMiddleware = createSagaMiddleware()
const initial_state = window.__INITIAL_STATE__

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose

const { createReduxHistory, routerMiddleware, routerReducer } =
  createReduxHistoryContext({
    history: createBrowserHistory(),
    selectRouterState: (state) => state.get('router')
  })

// ======================================================
// Middleware Configuration
// ======================================================
const middlewares = [sagaMiddleware, routerMiddleware]

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
  composeEnhancers(...enhancers)
)

sagaMiddleware.run(rootSaga)
store.close = () => store.dispatch(END)

if (module.hot) {
  // Enable webpack hot module replacement for reducers
  module.hot.accept('./reducers', () => {
    const nextReducers = root_reducer(history)
    store.replaceReducer(nextReducers)
  })
}

export const history = createReduxHistory(store)
