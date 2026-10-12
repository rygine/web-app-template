// A worker fixture: reads its payload from argv, reports progress, exits.
// It imports nothing, and it never attaches a message listener — see the note
// in subprocess.ts for why that second part matters.
//
// The exit waits on send's callback: process.send is asynchronous, so exiting
// straight after it drops the message.
const payload: unknown = JSON.parse(process.argv[2] ?? "null");
process.send?.({ progress: 50, saw: payload }, () => {
  process.exit(0);
});
