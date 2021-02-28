// 这个函数的作用是将 b 对象中的属性值赋值到 a 中，如果某个属性在两个对象中都有的话，则 a 中的这个属性会被覆盖
export function extend (a, b) {
  for (const key in b) {
    a[key] = b[key]
  }
  return a
}
