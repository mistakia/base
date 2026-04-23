// Lazy loader and post-render runner for mermaid diagrams.
//
// The markdown renderer emits `<div class="mermaid-source" data-mermaid>`
// wrappers for ```mermaid fences. After the rendered HTML lands in the DOM,
// the consuming view calls `run_mermaid_in(container)` which dynamic-imports
// mermaid (separate webpack chunk) and runs it against the wrapper nodes.
//
// securityLevel: 'strict' is non-negotiable -- it blocks click handlers and
// arbitrary HTML in diagram source (CVE-2025-54881-class vectors).

let mermaid_module = null
let initialized = false

const load_mermaid = async () => {
  if (mermaid_module) return mermaid_module
  const mod = await import(
    /* webpackChunkName: "mermaid" */ 'mermaid'
  )
  mermaid_module = mod.default || mod
  return mermaid_module
}

export const run_mermaid_in = async (root_element) => {
  if (!root_element) return
  const nodes = root_element.querySelectorAll('[data-mermaid]')
  if (nodes.length === 0) return

  const mermaid = await load_mermaid()
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    initialized = true
  }

  // mermaid uses data-processed to skip already-rendered nodes; clear it so
  // a fresh DOM (e.g. after React replaced innerHTML) re-renders cleanly.
  for (const node of nodes) {
    node.removeAttribute('data-processed')
  }

  await mermaid.run({ nodes: Array.from(nodes) })
}
