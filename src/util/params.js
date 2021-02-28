/* @flow */

import { warn } from './warn'
import Regexp from 'path-to-regexp'

// 创建一个全局的对象，导出的 fillParams 函数依据能够访问到这个对象，这个对象起到一个全局缓存的作用。
// 保存的 key 是未经处理的路径（例如：/foo/bar/:name），value 是一个函数类型，这个函数能够将对应的 key 值（未经处理的路径）和参数对象合并成完整的、真正的路径。
// $flow-disable-line
const regexpCompileCache: {
  [key: string]: Function
} = Object.create(null)

// fillParams 函数的作用是将未处理的路径（例如：/foo/bar/:name）和参数（例如：{ name:"tom" }）拼接成完整的路径（例如：/foo/bar/tom）
export function fillParams (
  path: string,
  params: ?Object,
  routeMsg: string
): string {
  params = params || {}
  try {
    // 获取路径 path 对应的填充函数
    const filler =
      // || 连接符能够起到 if 的作用，当左边的表达式为 false 的话，才会执行右边的表达式并获取其返回值。
      // 如果缓存对象 regexpCompileCache 中已经有了这个 path 对应的填充函数的话，直接从中获取对应的函数即可；
      // 如果缓存对象 regexpCompileCache 中没有这个 path 的话，执行 || 右边的表达式，
      // 右边的表达式借助 path-to-regexp 库中的 Regexp.compile(path) 生成这个 path 对应的填充函数，并将这个函数赋值到 regexpCompileCache 对象中
      // Regexp.compile() 函数的具体作用可以看我的这篇博客：https://fei_fei27.gitee.io/third-party-library/path-to-regexp.html#安装
      regexpCompileCache[path] ||
      (regexpCompileCache[path] = Regexp.compile(path))

    // Fix #2505 resolving asterisk routes { name: 'not-found', params: { pathMatch: '/not-found' }}
    // and fix #3106 so that you can work with location descriptor object having params.pathMatch equal to empty string
    if (typeof params.pathMatch === 'string') params[0] = params.pathMatch

    // 调用填充函数 filler，生成最终的路径
    return filler(params, { pretty: true })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // Fix #3072 no warn if `pathMatch` is string
      warn(typeof params.pathMatch === 'string', `missing param for ${routeMsg}: ${e.message}`)
    }
    return ''
  } finally {
    // delete the 0 if it was added
    delete params[0]
  }
}
