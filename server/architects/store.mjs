// Storage for The Architects: four collections + uploaded files.
//   architect_applications  who applied (alias, instagram, email, disciplines, links, one-liner, country, ref, invite, terms)
//   rooms                   one per Architect: the blueprint JSON, status, timestamps, admin note, chat usage
//   chamber_messages        the Creation Chamber transcript: TEXT ONLY (voice is transcribed and thrown away)
//   assets                  uploads (images, audio loops): metadata here, bytes in GridFS bucket "asset_files"
//   architect_links         one-time sign-in links (sha256 of the token, 20 min)
// With MONGODB_URI unset everything goes to server/data/architects/ so it runs locally.
// Ids are our own random strings (`id`), so the same code works on both.
import { GridFSBucket } from "mongodb";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export const newId = () => randomBytes(12).toString("hex");
const DIR = "data/architects";

// a tiny query matcher for the file fallback: equality and {$in: [...]}
const matches = (doc, q) =>
  Object.entries(q).every(([k, v]) => (v && typeof v === "object" && Array.isArray(v.$in) ? v.$in.includes(doc[k]) : doc[k] === v));

function fileCollection(name) {
  let docs = null;
  const path = `${DIR}/${name}.json`;
  const load = async () => {
    if (docs) return docs;
    try {
      docs = JSON.parse(await readFile(path, "utf8"));
    } catch {
      docs = [];
    }
    return docs;
  };
  let writing = Promise.resolve();
  const save = () => (writing = writing.then(() => writeFile(path, JSON.stringify(docs))));
  return {
    async insert(doc) {
      (await load()).push(structuredClone(doc));
      await save();
    },
    async findOne(q) {
      return structuredClone((await load()).find((d) => matches(d, q)) ?? null);
    },
    async find(q, { sort, limit } = {}) {
      let out = (await load()).filter((d) => matches(d, q));
      if (sort) {
        const [[k, dir]] = Object.entries(sort);
        out = [...out].sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
      }
      return structuredClone(limit ? out.slice(0, limit) : out);
    },
    async update(q, set) {
      const d = (await load()).find((x) => matches(x, q));
      if (d) Object.assign(d, structuredClone(set));
      await save();
    },
    async remove(q) {
      docs = (await load()).filter((d) => !matches(d, q));
      await save();
    },
    async count(q) {
      return (await load()).filter((d) => matches(d, q)).length;
    },
  };
}

function mongoCollection(col) {
  const strip = ({ _id, ...rest }) => rest;
  return {
    insert: (doc) => col.insertOne({ ...doc }),
    findOne: async (q) => {
      const d = await col.findOne(q);
      return d ? strip(d) : null;
    },
    find: async (q, { sort, limit } = {}) => {
      let c = col.find(q);
      if (sort) c = c.sort(sort);
      if (limit) c = c.limit(limit);
      return (await c.toArray()).map(strip);
    },
    update: (q, set) => col.updateOne(q, { $set: set }),
    remove: (q) => col.deleteMany(q),
    count: (q) => col.countDocuments(q),
  };
}

export async function openStore(mongoDb /* a Db or null */) {
  if (mongoDb) {
    const c = (n) => mongoDb.collection(n);
    await c("architect_applications").createIndex({ id: 1 }, { unique: true });
    await c("architect_applications").createIndex({ user_id: 1 });
    await c("architect_applications").createIndex({ email: 1 });
    await c("rooms").createIndex({ id: 1 }, { unique: true });
    await c("rooms").createIndex({ owner_id: 1 });
    await c("rooms").createIndex({ status: 1 });
    await c("chamber_messages").createIndex({ room_id: 1, created_at: 1 });
    await c("assets").createIndex({ id: 1 }, { unique: true });
    await c("assets").createIndex({ room_id: 1 });
    await c("architect_links").createIndex({ hash: 1 }, { unique: true });
    await c("architect_links").createIndex({ at: 1 }, { expireAfterSeconds: 20 * 60 });
    const bucket = new GridFSBucket(mongoDb, { bucketName: "asset_files" });
    return {
      apps: mongoCollection(c("architect_applications")),
      rooms: mongoCollection(c("rooms")),
      messages: mongoCollection(c("chamber_messages")),
      assets: mongoCollection(c("assets")),
      links: mongoCollection(c("architect_links")),
      async putFile(id, buf, contentType) {
        await new Promise((ok, fail) => bucket.openUploadStream(id, { metadata: { contentType } }).on("finish", ok).on("error", fail).end(buf));
      },
      async getFile(id) {
        const chunks = [];
        for await (const ch of bucket.openDownloadStreamByName(id)) chunks.push(ch);
        return Buffer.concat(chunks);
      },
      async deleteFile(id) {
        for (const f of await bucket.find({ filename: id }).toArray()) await bucket.delete(f._id);
      },
    };
  }
  await mkdir(`${DIR}/files`, { recursive: true });
  const safe = (id) => String(id).replace(/[^0-9a-f]/g, "");
  return {
    apps: fileCollection("architect_applications"),
    rooms: fileCollection("rooms"),
    messages: fileCollection("chamber_messages"),
    assets: fileCollection("assets"),
    links: fileCollection("architect_links"),
    putFile: (id, buf) => writeFile(`${DIR}/files/${safe(id)}`, buf),
    getFile: (id) => readFile(`${DIR}/files/${safe(id)}`),
    deleteFile: (id) => rm(`${DIR}/files/${safe(id)}`, { force: true }),
  };
}
