-- RELAY — Voice messaging support for the chat-images bucket.
--
-- The chat-images bucket was originally provisioned as image-only:
--   allowed_mime_types = {image/png,image/jpeg,image/gif,image/webp}
-- so the new voice-message feature (PR #24) was 400-rejected on every
-- send because the recorder uploads `audio/webm` (and falls back to
-- `audio/ogg` / `audio/mp4` on browsers that don't support webm).
--
-- This migration extends the bucket's allow-list to include the three
-- audio MIME types the voice recorder can produce. Run once per
-- environment.
--
-- Storage bucket configs live in the storage.buckets table; updating
-- the row is idempotent.
update storage.buckets
   set allowed_mime_types = array[
         'image/png','image/jpeg','image/gif','image/webp',
         'audio/webm','audio/ogg','audio/mp4'
       ]
 where id = 'chat-images';
