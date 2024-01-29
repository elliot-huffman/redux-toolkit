import type { InternalSerializeQueryArgs } from '../defaultSerializeQueryArgs'
import type { Api, ApiContext } from '../apiTypes'
import type {
  BaseQueryFn,
  BaseQueryError,
  QueryReturnValue,
} from '../baseQueryTypes'
import type {
  RootState,
  QueryKeys,
  QuerySubstateIdentifier,
  QueryCacheKey,
} from './apiState'
import { QueryStatus } from './apiState'
import type {
  StartQueryActionCreatorOptions,
  QueryActionCreatorResult,
} from './buildInitiate'
import { forceQueryFnSymbol, isUpsertQuery } from './buildInitiate'
import type {
  AssertTagTypes,
  EndpointDefinition,
  EndpointDefinitions,
  MutationDefinition,
  QueryArgFrom,
  QueryDefinition,
  ResultTypeFrom,
  FullTagDescription,
} from '../endpointDefinitions'
import { isQueryDefinition } from '../endpointDefinitions'
import { calculateProvidedBy } from '../endpointDefinitions'
import type {
  AsyncThunkPayloadCreator,
  Draft,
  UnknownAction,
} from '@reduxjs/toolkit'
import {
  isAllOf,
  isFulfilled,
  isPending,
  isRejected,
  isRejectedWithValue,
  createAsyncThunk,
  SHOULD_AUTOBATCH,
} from './rtkImports'
import type { Patch } from 'immer'
import { isDraftable, produceWithPatches } from 'immer'
import type { ThunkAction, ThunkDispatch, AsyncThunk } from '@reduxjs/toolkit'

import { HandledError } from '../HandledError'

import type { ApiEndpointQuery, PrefetchOptions } from './module'
import type { UnwrapPromise } from '../tsHelpers'
import { emplace } from '../../utils'

declare module './module' {
  export interface ApiEndpointQuery<
    Definition extends QueryDefinition<any, any, any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Definitions extends EndpointDefinitions,
  > extends Matchers<QueryThunk, Definition> {}

  export interface ApiEndpointMutation<
    Definition extends MutationDefinition<any, any, any, any, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Definitions extends EndpointDefinitions,
  > extends Matchers<MutationThunk, Definition> {}
}

type EndpointThunk<
  Thunk extends QueryThunk | MutationThunk,
  Definition extends EndpointDefinition<any, any, any, any>,
> =
  Definition extends EndpointDefinition<
    infer QueryArg,
    infer BaseQueryFn,
    any,
    infer ResultType
  >
    ? Thunk extends AsyncThunk<unknown, infer ATArg, infer ATConfig>
      ? AsyncThunk<
          ResultType,
          ATArg & { originalArgs: QueryArg },
          ATConfig & { rejectValue: BaseQueryError<BaseQueryFn> }
        >
      : never
    : never

export type PendingAction<
  Thunk extends QueryThunk | MutationThunk,
  Definition extends EndpointDefinition<any, any, any, any>,
> = ReturnType<EndpointThunk<Thunk, Definition>['pending']>

export type FulfilledAction<
  Thunk extends QueryThunk | MutationThunk,
  Definition extends EndpointDefinition<any, any, any, any>,
> = ReturnType<EndpointThunk<Thunk, Definition>['fulfilled']>

export type RejectedAction<
  Thunk extends QueryThunk | MutationThunk,
  Definition extends EndpointDefinition<any, any, any, any>,
> = ReturnType<EndpointThunk<Thunk, Definition>['rejected']>

export type Matcher<M> = (value: any) => value is M

export interface Matchers<
  Thunk extends QueryThunk | MutationThunk,
  Definition extends EndpointDefinition<any, any, any, any>,
> {
  matchPending: Matcher<PendingAction<Thunk, Definition>>
  matchFulfilled: Matcher<FulfilledAction<Thunk, Definition>>
  matchRejected: Matcher<RejectedAction<Thunk, Definition>>
}

export interface QueryThunkArg
  extends QuerySubstateIdentifier,
    StartQueryActionCreatorOptions {
  type: 'query'
  originalArgs: unknown
  endpointName: string
}

export interface MutationThunkArg {
  type: 'mutation'
  originalArgs: unknown
  endpointName: string
  track?: boolean
  fixedCacheKey?: string
}

export type ThunkResult = unknown

export type ThunkApiMetaConfig = {
  pendingMeta: {
    startedTimeStamp: number
    [SHOULD_AUTOBATCH]: true
  }
  fulfilledMeta: {
    fulfilledTimeStamp: number
    baseQueryMeta: unknown
    [SHOULD_AUTOBATCH]: true
  }
  rejectedMeta: {
    baseQueryMeta: unknown
    [SHOULD_AUTOBATCH]: true
  }
}
export type QueryThunk = AsyncThunk<
  ThunkResult,
  QueryThunkArg,
  ThunkApiMetaConfig
>
export type MutationThunk = AsyncThunk<
  ThunkResult,
  MutationThunkArg,
  ThunkApiMetaConfig
>

function defaultTransformResponse(baseQueryReturnValue: unknown) {
  return baseQueryReturnValue
}

export type MaybeDrafted<T> = T | Draft<T>
export type Recipe<T> = (data: MaybeDrafted<T>) => void | MaybeDrafted<T>
export type UpsertRecipe<T> = (
  data: MaybeDrafted<T> | undefined,
) => void | MaybeDrafted<T>

export type PatchQueryDataThunk<
  Definitions extends EndpointDefinitions,
  PartialState,
> = <EndpointName extends QueryKeys<Definitions>>(
  endpointName: EndpointName,
  args: QueryArgFrom<Definitions[EndpointName]>,
  patches: readonly Patch[],
  updateProvided?: boolean,
) => ThunkAction<void, PartialState, any, UnknownAction>

export type PatchQueriesDataThunk<
  Definitions extends EndpointDefinitions,
  PartialState,
> = (
  patchesByEndpointName: {
    [EndpointName in QueryKeys<Definitions>]?: Array<{
      args: QueryArgFrom<Definitions[EndpointName]>
      patches: readonly Patch[]
      updateProvided?: boolean
    }>
  },
  defaultUpdateProvided?: boolean,
) => ThunkAction<void, PartialState, any, UnknownAction>

export type UpdateQueryDataThunk<
  Definitions extends EndpointDefinitions,
  PartialState,
> = <EndpointName extends QueryKeys<Definitions>>(
  endpointName: EndpointName,
  args: QueryArgFrom<Definitions[EndpointName]>,
  updateRecipe: Recipe<ResultTypeFrom<Definitions[EndpointName]>>,
  updateProvided?: boolean,
) => ThunkAction<PatchCollection, PartialState, any, UnknownAction>

type PatchCollectionArray<InputArray extends any[] = any[]> = {
  [I in keyof InputArray]: PatchCollection
}

export type UpdateQueriesDataThunk<
  Definitions extends EndpointDefinitions,
  PartialState,
> = <
  EndpointMap extends {
    [EndpointName in QueryKeys<Definitions>]?: Array<{
      args: QueryArgFrom<Definitions[EndpointName]>
      updateRecipe: Recipe<ResultTypeFrom<Definitions[EndpointName]>>
      updateProvided?: boolean
    }>
  },
>(
  recipesByEndpointName: EndpointMap,
  defaultUpdateProvided?: boolean,
) => ThunkAction<
  {
    [EndpointName in keyof EndpointMap]: EndpointMap[EndpointName] extends any[]
      ? PatchCollectionArray<EndpointMap[EndpointName]>
      : never
  },
  PartialState,
  any,
  UnknownAction
>

export type UpsertQueryDataThunk<
  Definitions extends EndpointDefinitions,
  PartialState,
> = <EndpointName extends QueryKeys<Definitions>>(
  endpointName: EndpointName,
  args: QueryArgFrom<Definitions[EndpointName]>,
  value: ResultTypeFrom<Definitions[EndpointName]>,
) => ThunkAction<
  QueryActionCreatorResult<
    Definitions[EndpointName] extends QueryDefinition<any, any, any, any>
      ? Definitions[EndpointName]
      : never
  >,
  PartialState,
  any,
  UnknownAction
>

/**
 * An object returned from dispatching a `api.util.updateQueryData` call.
 */
export type PatchCollection = {
  /**
   * An `immer` Patch describing the cache update.
   */
  patches: Patch[]
  /**
   * An `immer` Patch to revert the cache update.
   */
  inversePatches: Patch[]
  /**
   * A function that will undo the cache update.
   */
  undo: () => void
}

export function buildThunks<
  BaseQuery extends BaseQueryFn,
  ReducerPath extends string,
  Definitions extends EndpointDefinitions,
>({
  reducerPath,
  baseQuery,
  context: { endpointDefinitions },
  serializeQueryArgs,
  api,
  assertTagType,
}: {
  baseQuery: BaseQuery
  reducerPath: ReducerPath
  context: ApiContext<Definitions>
  serializeQueryArgs: InternalSerializeQueryArgs
  api: Api<BaseQuery, Definitions, ReducerPath, any>
  assertTagType: AssertTagTypes
}) {
  type State = RootState<any, string, ReducerPath>

  const patchQueriesData: PatchQueriesDataThunk<Definitions, State> =
    (patchesByEndpointName, defaultUpdateProvided) => (dispatch, getState) => {
      const queryResultPatches: Parameters<
        typeof api.internalActions.queryResultsPatched
      >[0] = []

      const arrayified = Object.entries<
        | {
            args: any
            patches: readonly Patch[]
            updateProvided?: boolean
          }[]
        | undefined
      >(patchesByEndpointName)
      for (const [endpointName, patches] of arrayified) {
        if (!patches) continue
        for (const { args, patches: endpointPatches } of patches) {
          const endpointDefinition = endpointDefinitions[endpointName]

          const queryCacheKey = serializeQueryArgs({
            queryArgs: args,
            endpointDefinition,
            endpointName,
          })

          queryResultPatches.push({ queryCacheKey, patches: endpointPatches })
        }
      }

      if (queryResultPatches.length) {
        dispatch(api.internalActions.queryResultsPatched(queryResultPatches))
      }

      // now that the state is updated, we can update the tags

      const providedPatches: Parameters<
        typeof api.internalActions.updateProvidedBys
      >[0] = []

      for (const [endpointName, patches] of arrayified) {
        if (!patches) continue
        for (const {
          args,
          updateProvided = defaultUpdateProvided,
        } of patches) {
          if (!updateProvided) {
            continue
          }
          const endpointDefinition = endpointDefinitions[endpointName]

          const queryCacheKey = serializeQueryArgs({
            queryArgs: args,
            endpointDefinition,
            endpointName,
          })

          const newValue = api.endpoints[endpointName].select(args)(
            // Work around TS 4.1 mismatch
            getState() as RootState<any, any, any>,
          )

          const providedTags = calculateProvidedBy(
            endpointDefinition.providesTags,
            newValue.data,
            undefined,
            args,
            {},
            assertTagType,
          )

          providedPatches.push({ queryCacheKey, providedTags })
        }
      }
      if (providedPatches.length) {
        dispatch(api.internalActions.updateProvidedBys(providedPatches))
      }
    }

  const patchQueryData: PatchQueryDataThunk<EndpointDefinitions, State> = (
    endpointName,
    args,
    patches,
    updateProvided,
  ) => patchQueriesData({ [endpointName]: [{ args, patches, updateProvided }] })

  const updateQueriesData: UpdateQueriesDataThunk<Definitions, State> =
    (recipesByEndpointName, defaultUpdateProvided = true) =>
    (dispatch, getState) => {
      const ret: Record<string, Array<PatchCollection>> = {}
      const patchesByEndpointName: Parameters<
        PatchQueriesDataThunk<Definitions, State>
      >[0] = {}
      const stateCache = new Map<QueryCacheKey, any>()
      const arrayified = Object.entries<
        | {
            args: any
            updateRecipe: Recipe<any>
            updateProvided?: boolean
          }[]
        | undefined
      >(recipesByEndpointName)
      for (const [endpointName, recipes] of arrayified) {
        if (!recipes) continue
        const endpointPatches: Array<{
          args: any
          patches: readonly Patch[]
          updateProvided?: boolean
        }> = (patchesByEndpointName[endpointName as QueryKeys<Definitions>] ??=
          [])
        const endpointCollections = (ret[endpointName] ??= [])
        for (const [
          idx,
          { args, updateRecipe, updateProvided = defaultUpdateProvided },
        ] of recipes.entries()) {
          const endpointDefinition = endpointDefinitions[endpointName]
          const endpoint = api.endpoints[endpointName]

          const queryCacheKey = serializeQueryArgs({
            queryArgs: args,
            endpointDefinition,
            endpointName,
          })

          const currentState: ReturnType<ReturnType<typeof endpoint.select>> =
            emplace(stateCache, queryCacheKey, {
              insert: () =>
                endpoint.select(args)(
                  // Work around TS 4.1 mismatch
                  getState() as RootState<any, any, any>,
                ),
            })

          let patchCollection: PatchCollection = {
            patches: [],
            inversePatches: [],
            undo: () =>
              dispatch(
                api.util.patchQueryData(
                  endpointName as QueryKeys<Definitions>,
                  args,
                  patchCollection.inversePatches,
                  updateProvided,
                ),
              ),
          }

          if (currentState.status === QueryStatus.uninitialized) {
            endpointCollections[idx] = patchCollection
            continue
          }

          let newValue: any
          if ('data' in currentState) {
            if (isDraftable(currentState.data)) {
              const [value, patches, inversePatches] = produceWithPatches(
                currentState.data,
                updateRecipe,
              )
              patchCollection.patches.push(...patches)
              patchCollection.inversePatches.push(...inversePatches)
              newValue = value
            } else {
              newValue = updateRecipe(currentState.data)
              patchCollection.patches.push({
                op: 'replace',
                path: [],
                value: newValue,
              })
              patchCollection.inversePatches.push({
                op: 'replace',
                path: [],
                value: currentState.data,
              })
            }
            // update the state cache with the new value, so that any following recipes will see the updated value
            emplace(stateCache, queryCacheKey, {
              update: (v) => ({ ...v, data: newValue }),
            })
          }

          endpointCollections[idx] = patchCollection
          endpointPatches.push({
            args,
            patches: patchCollection.patches,
            updateProvided,
          })
        }
      }

      dispatch(
        api.util.patchQueriesData(patchesByEndpointName, defaultUpdateProvided),
      )

      return ret as any
    }

  const updateQueryData: UpdateQueryDataThunk<EndpointDefinitions, State> =
    (endpointName, args, updateRecipe, updateProvided = true) =>
    (dispatch, getState) =>
      dispatch(
        updateQueriesData({
          [endpointName]: [{ args, updateRecipe, updateProvided }],
        }),
      )[endpointName][0]

  const upsertQueryData: UpsertQueryDataThunk<Definitions, State> =
    (endpointName, args, value) => (dispatch) => {
      return dispatch(
        (
          api.endpoints[endpointName] as ApiEndpointQuery<
            QueryDefinition<any, any, any, any, any>,
            Definitions
          >
        ).initiate(args, {
          subscribe: false,
          forceRefetch: true,
          [forceQueryFnSymbol]: () => ({
            data: value,
          }),
        }),
      )
    }

  const executeEndpoint: AsyncThunkPayloadCreator<
    ThunkResult,
    QueryThunkArg | MutationThunkArg,
    ThunkApiMetaConfig & { state: RootState<any, string, ReducerPath> }
  > = async (
    arg,
    {
      signal,
      abort,
      rejectWithValue,
      fulfillWithValue,
      dispatch,
      getState,
      extra,
    },
  ) => {
    const endpointDefinition = endpointDefinitions[arg.endpointName]

    try {
      let transformResponse: (
        baseQueryReturnValue: any,
        meta: any,
        arg: any,
      ) => any = defaultTransformResponse
      let result: QueryReturnValue
      const baseQueryApi = {
        signal,
        abort,
        dispatch,
        getState,
        extra,
        endpoint: arg.endpointName,
        type: arg.type,
        forced:
          arg.type === 'query' ? isForcedQuery(arg, getState()) : undefined,
      }

      const forceQueryFn =
        arg.type === 'query' ? arg[forceQueryFnSymbol] : undefined
      if (forceQueryFn) {
        result = forceQueryFn()
      } else if (endpointDefinition.query) {
        result = await baseQuery(
          endpointDefinition.query(arg.originalArgs),
          baseQueryApi,
          endpointDefinition.extraOptions as any,
        )

        if (endpointDefinition.transformResponse) {
          transformResponse = endpointDefinition.transformResponse
        }
      } else {
        result = await endpointDefinition.queryFn(
          arg.originalArgs,
          baseQueryApi,
          endpointDefinition.extraOptions as any,
          (arg) =>
            baseQuery(
              arg,
              baseQueryApi,
              endpointDefinition.extraOptions as any,
            ),
        )
      }
      if (
        typeof process !== 'undefined' &&
        process.env.NODE_ENV === 'development'
      ) {
        const what = endpointDefinition.query ? '`baseQuery`' : '`queryFn`'
        let err: undefined | string
        if (!result) {
          err = `${what} did not return anything.`
        } else if (typeof result !== 'object') {
          err = `${what} did not return an object.`
        } else if (result.error && result.data) {
          err = `${what} returned an object containing both \`error\` and \`result\`.`
        } else if (result.error === undefined && result.data === undefined) {
          err = `${what} returned an object containing neither a valid \`error\` and \`result\`. At least one of them should not be \`undefined\``
        } else {
          for (const key of Object.keys(result)) {
            if (key !== 'error' && key !== 'data' && key !== 'meta') {
              err = `The object returned by ${what} has the unknown property ${key}.`
              break
            }
          }
        }
        if (err) {
          console.error(
            `Error encountered handling the endpoint ${arg.endpointName}.
              ${err}
              It needs to return an object with either the shape \`{ data: <value> }\` or \`{ error: <value> }\` that may contain an optional \`meta\` property.
              Object returned was:`,
            result,
          )
        }
      }

      if (result.error) throw new HandledError(result.error, result.meta)

      return fulfillWithValue(
        await transformResponse(result.data, result.meta, arg.originalArgs),
        {
          fulfilledTimeStamp: Date.now(),
          baseQueryMeta: result.meta,
          [SHOULD_AUTOBATCH]: true,
        },
      )
    } catch (error) {
      let catchedError = error
      if (catchedError instanceof HandledError) {
        let transformErrorResponse: (
          baseQueryReturnValue: any,
          meta: any,
          arg: any,
        ) => any = defaultTransformResponse

        if (
          endpointDefinition.query &&
          endpointDefinition.transformErrorResponse
        ) {
          transformErrorResponse = endpointDefinition.transformErrorResponse
        }
        try {
          return rejectWithValue(
            await transformErrorResponse(
              catchedError.value,
              catchedError.meta,
              arg.originalArgs,
            ),
            { baseQueryMeta: catchedError.meta, [SHOULD_AUTOBATCH]: true },
          )
        } catch (e) {
          catchedError = e
        }
      }
      if (
        typeof process !== 'undefined' &&
        process.env.NODE_ENV !== 'production'
      ) {
        console.error(
          `An unhandled error occurred processing a request for the endpoint "${arg.endpointName}".
In the case of an unhandled error, no tags will be "provided" or "invalidated".`,
          catchedError,
        )
      } else {
        console.error(catchedError)
      }
      throw catchedError
    }
  }

  function isForcedQuery(
    arg: QueryThunkArg,
    state: RootState<any, string, ReducerPath>,
  ) {
    const requestState = state[reducerPath]?.queries?.[arg.queryCacheKey]
    const baseFetchOnMountOrArgChange =
      state[reducerPath]?.config.refetchOnMountOrArgChange

    const fulfilledVal = requestState?.fulfilledTimeStamp
    const refetchVal =
      arg.forceRefetch ?? (arg.subscribe && baseFetchOnMountOrArgChange)

    if (refetchVal) {
      // Return if its true or compare the dates because it must be a number
      return (
        refetchVal === true ||
        (Number(new Date()) - Number(fulfilledVal)) / 1000 >= refetchVal
      )
    }
    return false
  }

  const queryThunk = createAsyncThunk<
    ThunkResult,
    QueryThunkArg,
    ThunkApiMetaConfig & { state: RootState<any, string, ReducerPath> }
  >(`${reducerPath}/executeQuery`, executeEndpoint, {
    getPendingMeta() {
      return { startedTimeStamp: Date.now(), [SHOULD_AUTOBATCH]: true }
    },
    condition(queryThunkArgs, { getState }) {
      const state = getState()

      const requestState =
        state[reducerPath]?.queries?.[queryThunkArgs.queryCacheKey]
      const fulfilledVal = requestState?.fulfilledTimeStamp
      const currentArg = queryThunkArgs.originalArgs
      const previousArg = requestState?.originalArgs
      const endpointDefinition =
        endpointDefinitions[queryThunkArgs.endpointName]

      // Order of these checks matters.
      // In order for `upsertQueryData` to successfully run while an existing request is in flight,
      /// we have to check for that first, otherwise `queryThunk` will bail out and not run at all.
      if (isUpsertQuery(queryThunkArgs)) {
        return true
      }

      // Don't retry a request that's currently in-flight
      if (requestState?.status === 'pending') {
        return false
      }

      // if this is forced, continue
      if (isForcedQuery(queryThunkArgs, state)) {
        return true
      }

      if (
        isQueryDefinition(endpointDefinition) &&
        endpointDefinition?.forceRefetch?.({
          currentArg,
          previousArg,
          endpointState: requestState,
          state,
        })
      ) {
        return true
      }

      // Pull from the cache unless we explicitly force refetch or qualify based on time
      if (fulfilledVal) {
        // Value is cached and we didn't specify to refresh, skip it.
        return false
      }

      return true
    },
    dispatchConditionRejection: true,
  })

  const mutationThunk = createAsyncThunk<
    ThunkResult,
    MutationThunkArg,
    ThunkApiMetaConfig & { state: RootState<any, string, ReducerPath> }
  >(`${reducerPath}/executeMutation`, executeEndpoint, {
    getPendingMeta() {
      return { startedTimeStamp: Date.now(), [SHOULD_AUTOBATCH]: true }
    },
  })

  const hasTheForce = (options: any): options is { force: boolean } =>
    'force' in options
  const hasMaxAge = (
    options: any,
  ): options is { ifOlderThan: false | number } => 'ifOlderThan' in options

  const prefetch =
    <EndpointName extends QueryKeys<Definitions>>(
      endpointName: EndpointName,
      arg: any,
      options: PrefetchOptions,
    ): ThunkAction<void, any, any, UnknownAction> =>
    (dispatch: ThunkDispatch<any, any, any>, getState: () => any) => {
      const force = hasTheForce(options) && options.force
      const maxAge = hasMaxAge(options) && options.ifOlderThan

      const queryAction = (force: boolean = true) =>
        (api.endpoints[endpointName] as ApiEndpointQuery<any, any>).initiate(
          arg,
          { forceRefetch: force },
        )
      const latestStateValue = (
        api.endpoints[endpointName] as ApiEndpointQuery<any, any>
      ).select(arg)(getState())

      if (force) {
        dispatch(queryAction())
      } else if (maxAge) {
        const lastFulfilledTs = latestStateValue?.fulfilledTimeStamp
        if (!lastFulfilledTs) {
          dispatch(queryAction())
          return
        }
        const shouldRetrigger =
          (Number(new Date()) - Number(new Date(lastFulfilledTs))) / 1000 >=
          maxAge
        if (shouldRetrigger) {
          dispatch(queryAction())
        }
      } else {
        // If prefetching with no options, just let it try
        dispatch(queryAction(false))
      }
    }

  function matchesEndpoint(endpointName: string) {
    return (action: any): action is UnknownAction =>
      action?.meta?.arg?.endpointName === endpointName
  }

  function buildMatchThunkActions<
    Thunk extends
      | AsyncThunk<any, QueryThunkArg, ThunkApiMetaConfig>
      | AsyncThunk<any, MutationThunkArg, ThunkApiMetaConfig>,
  >(thunk: Thunk, endpointName: string) {
    return {
      matchPending: isAllOf(isPending(thunk), matchesEndpoint(endpointName)),
      matchFulfilled: isAllOf(
        isFulfilled(thunk),
        matchesEndpoint(endpointName),
      ),
      matchRejected: isAllOf(isRejected(thunk), matchesEndpoint(endpointName)),
    } as Matchers<Thunk, any>
  }

  return {
    queryThunk,
    mutationThunk,
    prefetch,
    updateQueryData,
    updateQueriesData,
    upsertQueryData,
    patchQueryData,
    patchQueriesData,
    buildMatchThunkActions,
  }
}

export function calculateProvidedByThunk(
  action: UnwrapPromise<
    ReturnType<ReturnType<QueryThunk>> | ReturnType<ReturnType<MutationThunk>>
  >,
  type: 'providesTags' | 'invalidatesTags',
  endpointDefinitions: EndpointDefinitions,
  assertTagType: AssertTagTypes,
) {
  return calculateProvidedBy(
    endpointDefinitions[action.meta.arg.endpointName][type],
    isFulfilled(action) ? action.payload : undefined,
    isRejectedWithValue(action) ? action.payload : undefined,
    action.meta.arg.originalArgs,
    'baseQueryMeta' in action.meta ? action.meta.baseQueryMeta : undefined,
    assertTagType,
  )
}
