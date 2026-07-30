/**
 * ax-scan: Persistent daemon for fast grid-based accessibility scanning.
 *
 * Loads FBSimulatorControl once, then reads scan commands from stdin.
 * Each command is a single line of JSON, response is JSON followed by \n---\n sentinel.
 *
 * Command format:
 *   {"grid_step":50,"x_start":25,"y_start":25,"x_end":402,"y_end":874}
 *
 * Launch:
 *   ax-scan --udid <UDID>
 *
 * Sends "READY\n" to stdout once initialization is complete.
 */

#import <Foundation/Foundation.h>
#import <FBControlCore/FBControlCore.h>
#import <FBSimulatorControl/FBSimulatorControl.h>

static NSArray<NSDictionary *> *scanGrid(FBSimulator *simulator,
                                          CGFloat gridStep,
                                          CGFloat xStart, CGFloat yStart,
                                          CGFloat xEnd, CGFloat yEnd) {
    // Build grid of points
    NSMutableArray<NSValue *> *points = [NSMutableArray array];
    for (CGFloat y = yStart; y <= yEnd; y += gridStep) {
        for (CGFloat x = xStart; x <= xEnd; x += gridStep) {
            [points addObject:[NSValue valueWithPoint:NSMakePoint(x, y)]];
        }
    }

    // Fire all futures at once
    NSMutableArray<NSDictionary *> *allResults = [NSMutableArray array];
    NSLock *resultsLock = [[NSLock alloc] init];
    dispatch_group_t group = dispatch_group_create();
    dispatch_queue_t cbQueue = dispatch_queue_create("dev.touchbridge.ax-scan.callback", DISPATCH_QUEUE_SERIAL);

    for (NSValue *pointValue in points) {
        CGPoint point = CGPointMake(pointValue.pointValue.x, pointValue.pointValue.y);
        FBFuture<NSDictionary<NSString *, id> *> *future =
            [simulator accessibilityElementAtPoint:point nestedFormat:NO];

        dispatch_group_enter(group);
        [future onQueue:cbQueue notifyOfCompletion:^(FBFuture *completed) {
            NSDictionary *result = completed.result;
            if (result && ![result isKindOfClass:[NSNull class]]) {
                [resultsLock lock];
                [allResults addObject:result];
                [resultsLock unlock];
            }
            dispatch_group_leave(group);
        }];
    }

    // Pump main run loop until all futures complete
    while (dispatch_group_wait(group, DISPATCH_TIME_NOW) != 0) {
        [[NSRunLoop mainRunLoop] runMode:NSDefaultRunLoopMode
                              beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.001]];
    }

    // Deduplicate by (AXLabel, type, frame)
    NSMutableDictionary<NSString *, NSDictionary *> *unique = [NSMutableDictionary dictionary];
    for (NSDictionary *element in allResults) {
        NSString *label = element[@"AXLabel"] ?: @"";
        NSString *type = element[@"type"] ?: @"";
        NSDictionary *frame = element[@"frame"];
        NSString *key;
        if (frame) {
            key = [NSString stringWithFormat:@"%@|%@|%.0f,%.0f,%.0f,%.0f",
                   label, type,
                   [frame[@"x"] doubleValue], [frame[@"y"] doubleValue],
                   [frame[@"width"] doubleValue], [frame[@"height"] doubleValue]];
        } else {
            key = [NSString stringWithFormat:@"%@|%@|noframe", label, type];
        }
        if (!unique[key]) {
            unique[key] = element;
        }
    }

    return [unique allValues];
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        // Parse --udid from args
        NSArray<NSString *> *args = [[NSProcessInfo processInfo] arguments];
        NSString *udid = nil;
        for (NSUInteger i = 1; i < args.count; i++) {
            if ([args[i] isEqualToString:@"--udid"] && i + 1 < args.count) {
                udid = args[++i];
            }
        }
        if (!udid) {
            fprintf(stderr, "Usage: ax-scan --udid <UDID>\n");
            return 1;
        }

        // One-time initialization
        [FBSimulatorControlFrameworkLoader.essentialFrameworks loadPrivateFrameworksOrAbort];

        NSError *error = nil;
        FBSimulatorControlConfiguration *config = [FBSimulatorControlConfiguration
            configurationWithDeviceSetPath:nil logger:nil reporter:nil];
        FBSimulatorControl *control = [FBSimulatorControl withConfiguration:config error:&error];
        if (!control) {
            fprintf(stderr, "Error: %s\n", error.localizedDescription.UTF8String);
            return 1;
        }

        FBSimulator *simulator = [control.set simulatorWithUDID:udid];
        if (!simulator) {
            fprintf(stderr, "Error: No simulator with UDID %s\n", udid.UTF8String);
            return 1;
        }

        // Signal ready
        printf("READY\n");
        fflush(stdout);

        // Read commands from stdin, one JSON per line
        char buf[4096];

        while (1) {
            // Read a line from stdin
            if (!fgets(buf, sizeof(buf), stdin)) {
                break; // EOF — parent closed pipe
            }

            NSString *line = [[NSString alloc] initWithUTF8String:buf];
            line = [line stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            if (line.length == 0) continue;

            // Parse JSON command
            NSData *cmdData = [line dataUsingEncoding:NSUTF8StringEncoding];
            NSDictionary *cmd = [NSJSONSerialization JSONObjectWithData:cmdData options:0 error:&error];
            if (!cmd) {
                fprintf(stderr, "Invalid JSON: %s\n", error.localizedDescription.UTF8String);
                printf("{\"error\":\"invalid JSON\"}\n---\n");
                fflush(stdout);
                continue;
            }

            CGFloat gridStep = [cmd[@"grid_step"] doubleValue] ?: 50.0;
            CGFloat xStart = [cmd[@"x_start"] doubleValue] ?: 25.0;
            CGFloat yStart = [cmd[@"y_start"] doubleValue] ?: 25.0;
            CGFloat xEnd = [cmd[@"x_end"] doubleValue] ?: 402.0;
            CGFloat yEnd = [cmd[@"y_end"] doubleValue] ?: 874.0;

            // Run scan
            NSArray<NSDictionary *> *elements = scanGrid(simulator, gridStep, xStart, yStart, xEnd, yEnd);

            // Output JSON
            NSData *jsonData = [NSJSONSerialization dataWithJSONObject:elements
                                                              options:NSJSONWritingSortedKeys
                                                                error:&error];
            if (jsonData) {
                NSString *json = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                printf("%s\n---\n", json.UTF8String);
            } else {
                printf("{\"error\":\"serialization failed\"}\n---\n");
            }
            fflush(stdout);
        }

        return 0;
    }
}
