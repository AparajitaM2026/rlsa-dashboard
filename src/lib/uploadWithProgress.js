import { appParams } from '@/lib/app-params';

/**
 * Uploads a file to Base44 public storage with real-time progress tracking.
 * Uses XMLHttpRequest instead of the SDK's axios call so we can track upload progress.
 * Returns the same { file_url } shape as base44.integrations.Core.UploadPublicFile.
 */
export function uploadPublicFileWithProgress(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file, file.name);

    const appId = appParams.appId;
    const token =
      (typeof window !== 'undefined' && window.localStorage?.getItem('base44_access_token')) ||
      appParams.token;
    const url = appId && appId !== 'null'
      ? `/api/apps/${appId}/integration-endpoints/Core/UploadPublicFile`
      : `/api/uploads`;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Failed to parse upload response'));
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (appId) xhr.setRequestHeader('X-App-Id', String(appId));
    xhr.send(formData);
  });
}