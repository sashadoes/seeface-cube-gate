// Live speech-to-text for people who switched on "Transcribe me". Only TEXT ever leaves this
// module (as captions to our server). Audio is never recorded or stored by us.
//
// Providers sit behind this interface. "mock" (default, and whenever the server has no STT key)
// produces nothing: we never invent speech. A real streaming provider (Deepgram, AssemblyAI,
// Speechmatics…) plugs in here with a short-lived token minted by the world server, configured
// with its no-retention option. That wiring needs the provider choice + key (SETUP.md).

export type Stt = { start: (mic: MediaStream) => void; stop: () => void };

export function createStt(provider: string, onText: (text: string, final: boolean) => void): Stt {
  void onText;
  switch (provider) {
    default:
      return { start: () => {}, stop: () => {} };
  }
}
