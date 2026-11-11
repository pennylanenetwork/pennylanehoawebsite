self.addEventListener('push', (event) => {
  let notification = {
    title: 'Penny Lane HOA',
    body: 'You have a new resident portal notification.',
    url: '/portal',
  }

  try {
    if (event.data) notification = { ...notification, ...event.data.json() }
  } catch {
    if (event.data) notification.body = event.data.text()
  }

  event.waitUntil(self.registration.showNotification(notification.title, {
    body: notification.body,
    icon: '/penny-lane-favicon.png',
    badge: '/penny-lane-favicon.png',
    tag: notification.tag || 'plhoa-notification',
    data: { url: notification.url || '/portal' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(event.notification.data?.url || '/portal', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate(destination)
      return existing.focus()
    }
    return self.clients.openWindow(destination)
  })())
})
