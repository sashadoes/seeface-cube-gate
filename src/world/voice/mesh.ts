// Voice over a WebRTC mesh, signalled ONLY through our world server and ONLY for links the server
// created. Nothing is recorded: streams go straight into Web Audio and are never written anywhere.
//
// The microphone is asked for on the first talk, not on entry. Every connection is created with a
// send-capable audio transceiver; when you talk, your mic track is attached with replaceTrack
// (no renegotiation), and detached again when you stop, so nothing leaves your device while silent.
import type { Link } from "../../../shared/world/protocol.ts";
import type { WorldNet } from "../net/client.ts";

export type RemoteVoice = { peer: string; stream: MediaStream; kind: Link["kind"] };

export type VoiceAdapter = {
  setLinks: (links: Link[]) => void;
  /** start/stop sending your voice; resolves false if the mic was refused */
  setMic: (on: boolean) => Promise<boolean>;
  micStream: () => MediaStream | null;
  onVoice: (fn: (v: RemoteVoice) => void) => void;
  onVoiceGone: (fn: (peer: string) => void) => void;
  peers: () => string[];
  dispose: () => void;
};

type Conn = { pc: RTCPeerConnection; link: Link; sender: RTCRtpSender | null; makingOffer: boolean; ignoreOffer: boolean; stream: MediaStream | null };

export function createMeshVoice(net: WorldNet, ice: () => RTCIceServer[]): VoiceAdapter {
  const conns = new Map<string, Conn>();
  let mic: MediaStream | null = null;
  let micOn = false;
  let onVoice: (v: RemoteVoice) => void = () => {};
  let onGone: (p: string) => void = () => {};

  async function getMic() {
    if (mic) return mic;
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    return mic;
  }

  function attach(c: Conn) {
    const track = micOn && c.link.theyHearMe ? mic?.getAudioTracks()[0] ?? null : null;
    void c.sender?.replaceTrack(track);
  }

  function open(link: Link) {
    const pc = new RTCPeerConnection({ iceServers: ice() });
    const c: Conn = { pc, link, sender: null, makingOffer: false, ignoreOffer: false, stream: null };
    conns.set(link.peer, c);
    // one audio transceiver per link; direction follows who may hear whom
    const tr = pc.addTransceiver("audio", { direction: "sendrecv" });
    c.sender = tr.sender;
    attach(c);
    pc.ontrack = (e) => {
      if (!c.link.hearThem) return;
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      c.stream = stream;
      onVoice({ peer: link.peer, stream, kind: c.link.kind });
    };
    pc.onicecandidate = (e) => e.candidate && net.send({ t: "signal", to: link.peer, data: { ice: e.candidate.toJSON() } });
    // "perfect negotiation": the initiator is impolite, the other side yields on glare
    pc.onnegotiationneeded = async () => {
      try {
        c.makingOffer = true;
        await pc.setLocalDescription();
        net.send({ t: "signal", to: link.peer, data: { sdp: pc.localDescription } });
      } catch (e) {
        console.warn("voice: offer failed", e);
      } finally {
        c.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };
    return c;
  }

  function close(peer: string) {
    const c = conns.get(peer);
    if (!c) return;
    c.pc.close();
    conns.delete(peer);
    onGone(peer);
  }

  net.on("signal", async (m) => {
    let c = conns.get(m.from);
    if (!c) return; // the server only relays for links we have; ignore stragglers
    const data = m.data as { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
    const pc = c.pc;
    try {
      if (data.sdp) {
        const collision = data.sdp.type === "offer" && (c.makingOffer || pc.signalingState !== "stable");
        c.ignoreOffer = c.link.initiator && collision;
        if (c.ignoreOffer) return;
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === "offer") {
          await pc.setLocalDescription();
          net.send({ t: "signal", to: m.from, data: { sdp: pc.localDescription } });
        }
      } else if (data.ice) {
        try {
          await pc.addIceCandidate(data.ice);
        } catch (e) {
          if (!c.ignoreOffer) throw e;
        }
      }
    } catch (e) {
      console.warn("voice: signal failed", e);
    }
    c = undefined;
  });

  return {
    setLinks(links) {
      const want = new Map(links.map((l) => [l.peer, l]));
      for (const peer of [...conns.keys()]) if (!want.has(peer)) close(peer);
      for (const l of links) {
        const c = conns.get(l.peer);
        if (!c) open(l);
        else {
          const hadHear = c.link.hearThem;
          c.link = l;
          attach(c);
          if (!l.hearThem && hadHear) onGone(l.peer);
          else if (l.hearThem && !hadHear && c.stream) onVoice({ peer: l.peer, stream: c.stream, kind: l.kind });
        }
      }
    },
    async setMic(on) {
      if (on) {
        try {
          await getMic();
        } catch {
          return false;
        }
      }
      micOn = on;
      conns.forEach(attach);
      return true;
    },
    micStream: () => mic,
    onVoice: (fn) => (onVoice = fn),
    onVoiceGone: (fn) => (onGone = fn),
    peers: () => [...conns.keys()],
    dispose() {
      [...conns.keys()].forEach(close);
      mic?.getTracks().forEach((t) => t.stop());
      mic = null;
    },
  };
}
