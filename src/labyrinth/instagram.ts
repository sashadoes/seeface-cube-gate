// Instagram Stories. A website can't open the Story editor directly (Meta's
// "sharing to Stories" is for native apps only), so the way in is the phone's
// share sheet: the image or video goes to Instagram as a file. Instagram drops
// any text that comes with it, so the invite link is copied first and the
// player pastes it into a Link sticker. That copied link carries ?ref=ig-story,
// so the retention counters (src-ig-story / return-src-ig-story) show how many
// people Stories bring and whether they stay.
// Computers can't share files: the file is downloaded instead.

export type ShareHow = "shared" | "cancelled" | "downloaded";

/** the invite link, tagged as coming from an Instagram Story */
export function storyLink(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("ref", "ig-story");
    return u.toString();
  } catch {
    return url;
  }
}

/** Share a Story-sized file. `copied` = the link is on the clipboard, ready for a Link sticker. */
export async function shareToStory(file: File, text: string, url: string): Promise<{ how: ShareHow; copied: boolean }> {
  // no await before share(): Safari only allows it close to the tap
  const copied = navigator.clipboard?.writeText(storyLink(url)).then(
    () => true,
    () => false,
  ) ?? Promise.resolve(false);
  const data = { files: [file], title: "seeface1", text: `${text} ${url}` };
  let how: ShareHow;
  try {
    if (navigator.canShare?.(data)) {
      await navigator.share(data);
      how = "shared";
    } else {
      download(file);
      how = "downloaded";
    }
  } catch {
    how = "cancelled";
  }
  return { how, copied: await copied };
}

function download(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
