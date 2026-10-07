import type { AttendancePhoto } from '@/lib/photoEvidence'

/** Pending images are kept out of localStorage and out of the global attendance bundle. */
function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Este navegador no permite guardar la foto en el equipo.')); return }
    let settled = false
    const request = indexedDB.open('nexotime.attendancePhotos', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' })
    request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(request.result) } }
    request.onerror = () => { settled = true; reject(new Error('No se pudo abrir el almacenamiento de fotos.')) }
    request.onblocked = () => { settled = true; reject(new Error('Cierra otras pestañas de NexoTime y reintenta.')) }
  })
}
export async function putLocalPhoto(photo: AttendancePhoto): Promise<void> {
  const db = await openPhotos()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').add(photo)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('No hay espacio o permiso para guardar la foto. No se registró la entrada.')) }
  })
}
export async function getLocalPhoto(id: string): Promise<AttendancePhoto | undefined> {
  const db = await openPhotos()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly')
    const req = tx.objectStore('photos').get(id)
    tx.oncomplete = () => { db.close(); resolve(req.result as AttendancePhoto | undefined) }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('No se pudo leer la foto pendiente.')) }
  })
}
export async function removeLocalPhoto(id: string): Promise<void> {
  const db = await openPhotos()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite')
    tx.objectStore('photos').delete(id)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error('No se pudo limpiar la copia local.')) }
  })
}
