export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
}

export interface Session {
  userId: string;
  username: string;
}
