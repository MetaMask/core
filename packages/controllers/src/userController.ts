interface UserData {
  address: string;
  nickname: string;
  lastLogin?: number; // new field
}

// когда пользователь аутентифицируется:
function onLogin(user: UserData) {
  user.lastLogin = Date.now();
  localStorage.setItem('user', JSON.stringify(user));
}
