export const paths = {
  login: '/login',
  today: '/',
  offers: '/offers',
  job: (id: string) => `/jobs/${id}`,
  earnings: '/earnings',
  profile: '/profile',
} as const;
