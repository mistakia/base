// securityLevel: 'strict' blocks click handlers and arbitrary HTML in diagram
// source (CVE-2025-54881-class vectors).

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

export const run_mermaid_in = async (root_element, signal) => {
  if (!root_element) return
  const nodes = root_element.querySelectorAll('[data-mermaid]')
  if (nodes.length === 0) return

  const mermaid = await load_mermaid()
  if (signal?.aborted) return
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    initialized = true
  }

  for (const node of nodes) {
    node.removeAttribute('data-processed')
  }

  if (signal?.aborted) return
  await mermaid.run({ nodes: Array.from(nodes) })
}
