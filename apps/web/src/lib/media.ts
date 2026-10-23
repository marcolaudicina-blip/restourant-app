/** URL of an uploaded picture, served by app/api/media/[id] with long-lived cache headers. */
export const mediaUrl = (id: string) => `/api/media/${id}`;
