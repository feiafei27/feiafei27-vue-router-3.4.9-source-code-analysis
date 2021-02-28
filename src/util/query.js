/* @flow */

import { warn } from './warn'

const encodeReserveRE = /[!'()*]/g
const encodeReserveReplacer = c => '%' + c.charCodeAt(0).toString(16)
const commaRE = /%2C/g

// fixed encodeURIComponent which is more conformant to RFC3986:
// - escapes [!'()*]
// - preserve commas
const encode = str =>
  encodeURIComponent(str)
    .replace(encodeReserveRE, encodeReserveReplacer)
    .replace(commaRE, ',')

export function decode (str: string) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      warn(false, `Error decoding "${str}". Leaving it intact.`)
    }
  }
  return str
}

// 函数的作用是解析并合并 query
export function resolveQuery (
  query: ?string,
  extraQuery: Dictionary<string> = {},
  _parseQuery: ?Function
): Dictionary<string> {
  // 如果用户配置了 _parseQuery 的话，就使用用户配置的查询字符串解析函数。否则的话，使用默认的查询字符串解析函数（parseQuery）
  // 这个函数的作用是将查询参数字符串（例如：name=tom&age=22）转换成对象形式 { name: 'tom', age: 22 }
  const parse = _parseQuery || parseQuery

  let parsedQuery
  try {
    // 将查询参数字符串解析成对象形式
    parsedQuery = parse(query || '')
  } catch (e) {
    // 因为有可能用户自定义查询字符串解析函数，有可能发生意想不到的错误，
    // 在这里使用 try{}catch(e){} 进行捕获，并将 parsedQuery 设为空对象
    process.env.NODE_ENV !== 'production' && warn(false, e.message)
    parsedQuery = {}
  }
  // 将 extraQuery query 对象中的数据添加到 parsedQuery 中
  for (const key in extraQuery) {
    // 获取当前 key 的 value
    const value = extraQuery[key]
    // 将这个 key 赋值到 parsedQuery 对象中
    parsedQuery[key] = Array.isArray(value)
      ? value.map(castQueryParamValue)
      : castQueryParamValue(value)
  }
  // 返回解析合并完成的 query 对象
  return parsedQuery
}

// 这是一个箭头函数，如果传递的参数是 null 或者 对象形式的话，直接返回这个参数，否则的话，返回 String(value)
const castQueryParamValue = value => (value == null || typeof value === 'object' ? value : String(value))

// 默认的解析查询（query）字符串的函数
// 这个函数的作用是将查询参数字符串（例如：name=tom&age=22）转换成对象形式 { name: 'tom', age: 22 }
function parseQuery (query: string): Dictionary<string> {
  const res = {}

  query = query.trim().replace(/^(\?|#|&)/, '')

  if (!query) {
    return res
  }

  query.split('&').forEach(param => {
    const parts = param.replace(/\+/g, ' ').split('=')
    const key = decode(parts.shift())
    const val = parts.length > 0 ? decode(parts.join('=')) : null

    if (res[key] === undefined) {
      res[key] = val
    } else if (Array.isArray(res[key])) {
      res[key].push(val)
    } else {
      res[key] = [res[key], val]
    }
  })

  return res
}

// 该函数的作用和 parseQuery 相反，可以将对象形式 { name:'tom',age:22 } 的 query 转换成字符串形式的（name=tom&age=22）
export function stringifyQuery (obj: Dictionary<string>): string {
  const res = obj
    ? Object.keys(obj)
      .map(key => {
        const val = obj[key]

        if (val === undefined) {
          return ''
        }

        if (val === null) {
          return encode(key)
        }

        if (Array.isArray(val)) {
          const result = []
          val.forEach(val2 => {
            if (val2 === undefined) {
              return
            }
            if (val2 === null) {
              result.push(encode(key))
            } else {
              result.push(encode(key) + '=' + encode(val2))
            }
          })
          return result.join('&')
        }

        return encode(key) + '=' + encode(val)
      })
      .filter(x => x.length > 0)
      .join('&')
    : null
  return res ? `?${res}` : ''
}
