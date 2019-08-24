// Theirs
import React from 'react'
import ReactGA from 'react-ga'

import Editor from './Editor'
import Toasts from './Toasts'
import { GA_TRACKING_ID, THEMES } from '../lib/constants'
import { updateRouteState } from '../lib/routing'
import { getThemes, saveThemes, clearSettings, saveSettings } from '../lib/util'

import { useAPI } from './ApiContext'
import { useAuth } from './AuthContext'
import { useAsyncCallback } from '@dawnlabs/tacklebox'

// TODO remove
import { client } from '../lib/api'

function onReset() {
  clearSettings()

  if (window.navigator && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.unregister()
      })
    })
  }
}

function useAppInstallationsListener() {
  React.useEffect(() => {
    ReactGA.initialize(GA_TRACKING_ID)

    function onInstall() {
      ReactGA.event({
        category: 'Analytics',
        action: 'App Install'
      })
    }

    window.addEventListener('appinstalled', onInstall)
    return () => window.removeEventListener('appinstalled', onInstall)
  }, [])
}

function toastsReducer(curr, action) {
  switch (action.type) {
    case 'ADD': {
      if (!curr.find(t => t.children === action.toast.children)) {
        return curr.concat(action.toast)
      }
      return curr
    }
    case 'SET': {
      return action.toasts
    }
  }
  throw new Error('Unsupported action')
}

function userTiming({ category, status, value }) {
  try {
    ReactGA.event({
      category: 'Performance',
      action: status,
      label: category,
      value
    })
  } catch (err) {
    // pass
  }
}
function usePerformanceMeasurement() {
  React.useEffect(() => {
    ReactGA.initialize(GA_TRACKING_ID)
    try {
      if (window.performance && window.performance.getEntriesByType) {
        window.performance.getEntriesByType('paint').forEach(entry => {
          userTiming({
            category: 'paint',
            status: entry.name,
            value: entry.startTime
          })
        })
        const navigationTiming = window.performance.getEntriesByType('navigation')
          ? window.performance.getEntriesByType('navigation')[0]
          : null
        if (navigationTiming) {
          userTiming({
            category: 'paint',
            status: 'time to first byte',
            value: navigationTiming.responseEnd - navigationTiming.requestStart
          })
        }

        const javascriptFiles = performance.getEntries().filter(resource => {
          return resource.name.startsWith(`${location.origin}/_next/static`)
        })

        /*
         * Tracks total number of javascript used,
         * helps in tracking the effect of granular chunks work
         */
        userTiming({
          category: 'javascript',
          status: 'script count',
          value: javascriptFiles.length
        })

        /*
         * Tracks total size of javascript used,
         * helps in tracking the effect of modern/nomodern work
         */
        userTiming({
          category: 'javascript',
          status: 'script size',
          value: javascriptFiles.reduce((sum, script) => script.encodedBodySize + sum, 0)
        })
      }
    } catch (error) {
      console.error(error)
    }
  }, [])
}

function EditorContainer(props) {
  useAppInstallationsListener()
  usePerformanceMeasurement()
  const [themes, updateThemes] = React.useState(THEMES)
  const api = useAPI()
  const user = useAuth()
  const [update, { loading }] = useAsyncCallback(api.snippet.update)

  React.useEffect(() => {
    const storedThemes = getThemes(localStorage) || []
    if (storedThemes) {
      updateThemes(currentThemes => [...storedThemes, ...currentThemes])
    }
  }, [])

  React.useEffect(() => {
    saveThemes(themes.filter(({ custom }) => custom))
  }, [themes])

  // XXX use context
  const [snippet, setSnippet] = React.useState(props.snippet || null)
  const [toasts, setToasts] = React.useReducer(toastsReducer, [])

  const snippetId = snippet && snippet.id
  React.useEffect(() => {
    if ('/' + (snippetId || '') === props.router.asPath) {
      return
    }
    props.router.replace('/', '/' + (snippetId || ''), { shallow: true })
  }, [snippetId, props.router])

  const [snippets, setSnippets] = React.useState([])
  const [snippetPage, setSnippetPage] = React.useState(0)

  React.useEffect(() => {
    if (user) {
      // TODO
      user.getIdToken().then(jwt => {
        client.defaults.headers['Authorization'] = jwt ? `Bearer ${jwt}` : undefined
        api.snippet
          .list(snippetPage)
          .then(newSnippets => setSnippets(curr => curr.concat(newSnippets)))
      })
    }
  }, [api.snippet, snippetPage, user])

  function onEditorUpdate(state) {
    if (loading) {
      return
    }

    if (!user) {
      updateRouteState(props.router, state)
      saveSettings(state)
    } else {
      const updates = state
      if (!snippet) {
        update(snippetId, updates).then(newSnippet => {
          if (newSnippet && newSnippet.id) {
            setSnippet(newSnippet)
            setToasts({
              type: 'ADD',
              toast: { children: 'Snippet saved!', closable: true }
            })
          }
        })
      } else if (snippet.userId === user.uid) {
        update(snippetId, updates).then(() => {
          setToasts({
            type: 'ADD',
            toast: { children: 'Snippet saved!', closable: true }
          })
        })
      }
    }
  }

  return (
    <>
      <Toasts toasts={toasts} />
      <Editor
        {...props}
        themes={themes}
        updateThemes={updateThemes}
        snippet={snippet}
        setSnippet={setSnippet}
        snippets={snippets}
        onLoadMoreSnippets={() => setSnippetPage(p => p + 1)}
        setToasts={setToasts}
        onUpdate={onEditorUpdate}
        onReset={onReset}
      />
    </>
  )
}

export default EditorContainer
