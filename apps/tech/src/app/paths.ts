export const paths = {
  login: '/login',
  join: '/join',
  joinStatus: '/join/status',
  today: '/',
  offers: '/offers',
  job: (id: string) => `/jobs/${id}`,
  earnings: '/earnings',
  profile: '/profile',
} as const;
