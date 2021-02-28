import { warn } from '../util/warn'
import { extend } from '../util/misc'
import { handleRouteEntered } from '../util/route'

// 阅读这部分代码之前，先自行查看 Vue 官网中与渲染函数有关的内容：https://cn.vuejs.org/v2/guide/render-function.html
// 在官方文档的 渲染函数 & JSX --> 函数式组件 部分中，官方文档有如下的介绍：
// 在作为包装组件时它们也同样非常有用。比如，当你需要做这些时：
//   （1）程序化地在多个组件中选择一个来代为渲染；
//   （2）在将 children、props、data 传递给子组件之前操作它们。
// RouterView 函数式组件就是上面（1）和（2）的具体体现
// 该组件的作用是：渲染路径匹配到的视图组件
export default {
  // 自定义组件的名称
  name: 'RouterView',
  // RouterView 组件是一个函数式组件
  functional: true,
  props: {
    name: {
      type: String,
      default: 'default'
    }
  },
  render (_, { props, children, parent, data }) {
    // 用于在 devtools 工具中为 router-view 组件显示一个徽章，
    // routerView 属性起到一个标志 router-view 组件的作用
    data.routerView = true

    // 直接使用父组件上下文中的 createElement 函数
    // 以便于通过 router-view 渲染的组件可以解析命名插槽
    const h = parent.$createElement
    // 获取命名视图的名称，
    // 看官方文档的命名视图部分：https://router.vuejs.org/zh/guide/essentials/named-views.html
    const name = props.name
    // 获取当前匹配的路由 route
    const route = parent.$route
    // 获取当前 router-view 的父组件的 _routerViewCache 对象，该对象用于缓存该 router-view 需要渲染的组件
    const cache = parent._routerViewCache || (parent._routerViewCache = {})

    // 通过 router-view 渲染的组件内还可以有另一个 router-view 组件，
    // router-view 是能够嵌套的，在这里需要计算当前 router-view 的深度
    let depth = 0
    let inactive = false
    // 通过 parent 一级一级向上，如果 $vnode.data.routerView 为 true 的话，depth++
    // 每一个 Vue 实例都有 _routerRoot 属性，根 Vue 组件的 _routerRoot 属性指向他自己，
    // 这一点可以看 install.js 中的 45 行。如果 parent._routerRoot == parent 的话，说明当前的 router-view 是最顶级的 router-view
    while (parent && parent._routerRoot !== parent) {
      // 获取父元素的 $vnode.data
      const vnodeData = parent.$vnode ? parent.$vnode.data : {}
      // 如果 data 中的 routerView 为 true 的话，说明该父组件是通过 router-view 渲染而来的，此时 depth 应该加一
      if (vnodeData.routerView) {
        depth++
      }
      if (vnodeData.keepAlive && parent._directInactive && parent._inactive) {
        inactive = true
      }
      // 调到上一级
      parent = parent.$parent
    }
    // 将 depth 设置到 data 中，这个 data 将会被作为 h 的参数用于渲染导航到的组件
    data.routerViewDepth = depth

    // render previous view if the tree is inactive and kept-alive
    if (inactive) {
      // 获取该 router-view 的缓存，每一个缓存有三个数据：
      // {
      //   component,
      //   route,
      //   configProps
      // }
      const cachedData = cache[name]
      // 获取该缓存中的组件
      const cachedComponent = cachedData && cachedData.component
      // 如果 cachedComponent 为 true 的话，说明的确存在该缓存
      if (cachedComponent) {
        // #2301
        // pass props
        if (cachedData.configProps) {
          // 将路由配置中的 props 填充到 data 中
          fillPropsinData(cachedComponent, data, cachedData.route, cachedData.configProps)
        }
        // 渲染该组件
        return h(cachedComponent, data, children)
      } else {
        // render previous empty view
        return h()
      }
    }

    // route.matched 的类型是 Array<RouteRecord>，RouteRecord 的数组，RouteRecord 中的 components 对象指定要渲染的组件
    // 例设我们有路径：/foo/bar/zoo,
    // /foo 对应的路由记录是 fooRouteRecord,
    // /foo/bar 对应的路由记录是 barRouteRecord,
    // /foo/bar/zoo 对应的路由记录是 zooRouteRecord,
    // 如果此时的 path 是 /foo/bar/zoo 的话，那么该 path 对应的 Route 的 matched 属性则为 [fooRouteRecord,barRouteRecord,zooRouteRecord],
    // 我们可以看到每一级路由都对应着一个路由记录，当执行 RouterView 的 render 函数的时候，会计算当前 router-view 的深度，根据这个深度到 matched
    // 数组中获取这个深度对应的路由记录，然后在路由记录中找到要渲染的组件，

    // 获取当前 router-view 对应的路由记录
    const matched = route.matched[depth]
    // 在一个 Vue 实例中，有可能同时存在多个 router-view 组件，不同的 router-view 以不同的命名进行区分
    // 在这里，通过视图的命名获取该视图要渲染的组件
    const component = matched && matched.components[name]

    // render empty node if no matched route or no config component
    // 如果没有找到相对应的路由记录，或者没有找到渲染的组件的话，
    // 向 cache 中缓存当前 router-view 应该渲染的组件为 null，并且 return h(),表示当前的 router-view 不用渲染任何东西
    if (!matched || !component) {
      // cache[name] = null 表示：Vue 实例中的该 router-view 没有要渲染的组件
      cache[name] = null
      return h()
    }

    // 缓存当前的 router-view 要渲染的组件
    cache[name] = { component }

    // attach instance registration hook
    // this will be called in the instance's injected lifecycle hooks
    data.registerRouteInstance = (vm, val) => {
      // val could be undefined for unregistration
      const current = matched.instances[name]
      if (
        (val && current !== vm) ||
        (!val && current === vm)
      ) {
        matched.instances[name] = val
      }
    }

    // also register instance in prepatch hook
    // in case the same component instance is reused across different routes
    (data.hook || (data.hook = {})).prepatch = (_, vnode) => {
      matched.instances[name] = vnode.componentInstance
    }

    // register instance in init hook
    // in case kept-alive component be actived when routes changed
    data.hook.init = (vnode) => {
      if (vnode.data.keepAlive &&
        vnode.componentInstance &&
        vnode.componentInstance !== matched.instances[name]
      ) {
        matched.instances[name] = vnode.componentInstance
      }

      // if the route transition has already been confirmed then we weren't
      // able to call the cbs during confirmation as the component was not
      // registered yet, so we call it here.
      handleRouteEntered(route)
    }

    // 对应官网：https://router.vuejs.org/zh/guide/essentials/passing-props.html
    // 获取当前的 router-view 对应的 prop
    const configProps = matched.props && matched.props[name]
    // 如果存在当前 router-view 所对应的 prop 的话
    if (configProps) {
      // cache[name] = { component }
      // 将 route 和 configProps 也放到缓存中，到此，Vue 实例中对某个 router-view 的缓存包括：
      // {
      //   component,
      //   route,
      //   configProps
      // }
      extend(cache[name], {
        route,
        configProps
      })
      // fillPropsinData 函数需要这三个数据，将他们都缓存起来，为 63 行的渲染做准备
      fillPropsinData(component, data, route, configProps)
    }

    // 使用 h 渲染匹配到的组件
    return h(component, data, children)
  }
}

// 该函数的作用是将路由配置中的 props 填充到 data 中
function fillPropsinData (component, data, route, configProps) {
  // 先查看官网中与这一段有关的部分：https://router.vuejs.org/zh/guide/essentials/passing-props.html
  // 从官方的介绍，我们可以知道 props 能够被设置成三种模式：布尔模式、对象模式和函数模式
  // 下面这一行通过 resolveProps 函数解析出真正的 props 对象
  let propsToPass = data.props = resolveProps(route, configProps)
  if (propsToPass) {
    // 克隆这个对象，防止其被其他的引用所改变
    propsToPass = data.props = extend({}, propsToPass)
    // pass non-declared props as attrs
    const attrs = data.attrs = data.attrs || {}
    for (const key in propsToPass) {
      // 如果渲染的组件的 props 没有这个 key 的话，将其赋值到 data.attrs 中，并删除 data.props 中的该属性
      if (!component.props || !(key in component.props)) {
        attrs[key] = propsToPass[key]
        delete propsToPass[key]
      }
    }
  }
}

// 我们所配置的路由 props 有可能是布尔模式、对象模式或者函数模式
// resolveProps 函数的作用就是解析 props，获取真正的 props 对象
function resolveProps (route, config) {
  switch (typeof config) {
    // 如果 config 的类型是 undefined 的话，说明用户没有配置 props，再次直接 return
    case 'undefined':
      return
    // 如果 config 的类型是 object 的话，直接 return config，关于这一个可以看官网-->路由组件传参-->对象模式
    case 'object':
      return config
    // 如果是函数类型的话，将 route 作为参数执行它并返回该函数的返回值，
    // 关于这一个可以看官网-->路由组件传参-->函数模式
    case 'function':
      return config(route)
    // 如果是布尔模式的话，返回路由配置中的 params，关于这一个可以看官网-->路由组件传参-->布尔模式
    case 'boolean':
      return config ? route.params : undefined
    default:
      if (process.env.NODE_ENV !== 'production') {
        // 否则的话，发出警报 props 类型必须是对象、函数或者布尔类型
        warn(
          false,
          `props in "${route.path}" is a ${typeof config}, ` +
          `expecting an object, function or boolean.`
        )
      }
  }
}
