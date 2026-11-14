// Asks a model for one structured answer through a tool.
//
// Some models reject a forced tool choice ("tool_choice: type tool and any are
// not supported for this model"), so this never forces one. It tells the model
// to answer through the tool, and if the reply comes back as prose it asks
// once more. Tested in tests/agent.test.mjs.
const API = 'https://api.anthropic.com/v1/messages';

export async function callForTool({ key, payload, toolName, fetchImpl = fetch, attempts = 2 }) {
  const usage = { input_tokens: 0, output_tokens: 0 };
  const system = `${payload.system || ''}\n\nAnswer by calling the ${toolName} tool. Do not answer in prose.`.trim();
  let messages = payload.messages;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetchImpl(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ ...payload, system, messages, tool_choice: { type: 'auto' } }),
    });
    if (!res.ok) throw new Error(`${toolName}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    usage.input_tokens += data.usage?.input_tokens || 0;
    usage.output_tokens += data.usage?.output_tokens || 0;
    const call = (data.content || []).find((b) => b.type === 'tool_use' && b.name === toolName);
    if (call) return { input: call.input, usage };
    const said = (data.content || []).filter((b) => b.type === 'text' && b.text);
    messages = [...messages, { role: 'assistant', content: said.length ? said : [{ type: 'text', text: '(no answer)' }] }, { role: 'user', content: `Call the ${toolName} tool now with your answer.` }];
  }
  throw new Error(`${toolName}: the model did not call the tool`);
}
