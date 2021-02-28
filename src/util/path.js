/* @flow */

// 该函数将基础路径和相对路径拼接起来，返回总的路径
export function resolvePath (
  relative: string,
  base: string,
  append?: boolean
): string {
  // 获取相对路径的的第一个字符
  const firstChar = relative.charAt(0)
  // 如果相对路径的第一个字符是 / 的话，直接返回这个相对路径
  if (firstChar === '/') {
    return relative
  }

  // 如果第一个字符是 ? 或者 # 的话，说明这个相对路径并不是路径，而是 查询参数 或者 hash，
  // 这种情况将 relative 拼接在 base 后面即可
  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  // 将 base 路径字符串按照分隔符分割成字符串数组，例如："foo/bar/main" --> [ 'foo', 'bar', 'main' ]
  const stack = base.split('/')

  // 在以下两种情况下，会将 stack 数组的最后一个元素移除掉
  // (1) append == false 的情况下：这种情况下，用户想要导航的路径是当前路径的相对路径，所以最后一个元素需要移除掉
  // (2) base 路径的最后一个字符是 /（例如：foo/bar/main/ --> ['foo','bar','main','']）
  //     的情况下：这种情况下，最后一个元素是空字符串，没有意义，需要删除
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // 下面处理相对路径
  // 如果相对路径的第一个字符是 / 的话，将其删除，不过这部分代码没有意义，因为如果相对路径的第一个字符是 / 的话，13 行代码已经 return 了
  // 然后将相对路径按照分隔符分割成字符串数组
  const segments = relative.replace(/^\//, '').split('/')
  // 遍历 segments
  for (let i = 0; i < segments.length; i++) {
    // 获取当前遍历的字符串
    const segment = segments[i]
    // 如果字符串是 '..' 的话，说明需要上一级的路由，这种情况下，删除 stack 字符串数组的最后一个元素
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      // 如果字符串是 '.' 的话，就什么都不做
      // 否则的话，将当前的字符串 push 进 stack 数组中
      stack.push(segment)
    }
  }

  // 如果 stack 的第一个元素不是空字符串的话，往 stack 数组的开头添加 ''，这样可以确保数组按照 / 拼接时，第一个字符是 /，
  // 例如: ['','foo','bar'] --> /foo/bar，否则的话：['foo','bar'] --> foo/bar
  if (stack[0] !== '') {
    stack.unshift('')
  }

  // 拼接并返回最终的路径
  return stack.join('/')
}

// 处理类似于 { path: "/foo/bar?name='tom'&age=22#安装" } 这样的导航的函数
// 将这个 path 解析成 path、query 和 hash
export function parsePath (path: string): {
  path: string;
  query: string;
  hash: string;
} {
  let hash = ''
  let query = ''

  // 利用 indexOf 获取 path 中 # 字符的下标
  const hashIndex = path.indexOf('#')
  // 如果 path 中存在 # 字符的话
  if (hashIndex >= 0) {
    // 将 hash 从 path 中截取出来，hash 是 # 符号之后的内容（例如：安装）
    hash = path.slice(hashIndex)
    // 截取除 hash 之外的内容（例如：/foo/bar?name='tom'&age=22）
    path = path.slice(0, hashIndex)
  }

  // 判断这个 path 有没有 ? 符号，有的话，说明这个 path 有查询参数
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) {
    // 将查询参数字符串截取出来（例如：name='tom'&age=22）
    query = path.slice(queryIndex + 1)
    // 截取剩下的 path（例如：/foo/bar）
    path = path.slice(0, queryIndex)
  }

  // 返回解析完成的 path、query 和 hash
  return {
    path,
    query,
    hash
  }
}

export function cleanPath (path: string): string {
  return path.replace(/\/\//g, '/')
}
